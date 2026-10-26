using System.IO.Compression;
using System.Text.Json;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using ResumeBuilder.Api.Data;
using ResumeBuilder.Api.Models;
using ResumeBuilder.Api.Services;

namespace ResumeBuilder.Api.Endpoints;

public record ImportInput(string Yaml, bool ImportProfile, bool CreateResume, string? ResumeName);

public record LibraryExport(int Format, DateTime ExportedAt, Profile? Profile, List<Fragment> Fragments, List<Job>? Jobs);

public static class SystemEndpoints
{
    public static void MapSystemEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/meta", async (RenderCvService render, AppPaths paths) => new
        {
            themes = CvYamlBuilder.Themes,
            pageSizes = CvYamlBuilder.PageSizes,
            fonts = CvYamlBuilder.Fonts,
            locales = CvYamlBuilder.Locales,
            socialNetworks = CvYamlBuilder.SocialNetworks,
            entryTypes = Enum.GetNames<EntryType>().Select(JsonNamingPolicy.CamelCase.ConvertName),
            jobStatuses = Enum.GetNames<JobStatus>().Select(JsonNamingPolicy.CamelCase.ConvertName),
            themeMargins = CvYamlBuilder.Themes.ToDictionary(t => t, CvYamlBuilder.DefaultMargin),
            rendercv = await render.VersionAsync(),
            dataDirectory = paths.DataDir,
        });

        app.MapGet("/api/stats", async (AppDbContext db) =>
        {
            var jobs = await db.Jobs.AsNoTracking().ToListAsync();
            var versions = await db.Versions.AsNoTracking().Include(v => v.Job).OrderByDescending(v => v.CreatedAt).Take(8).ToListAsync();
            return new
            {
                fragments = await db.Fragments.CountAsync(f => !f.Archived),
                resumes = await db.Resumes.CountAsync(),
                versions = await db.Versions.CountAsync(),
                jobs = jobs.Count,
                byStatus = jobs.GroupBy(j => j.Status).ToDictionary(x => JsonNamingPolicy.CamelCase.ConvertName(x.Key.ToString()), x => x.Count()),
                appliedLast30 = jobs.Count(j => j.AppliedAt > DateTime.UtcNow.AddDays(-30)),
                upcomingDeadlines = jobs.Where(j => j.Deadline >= DateTime.UtcNow.Date && j.Status == JobStatus.Saved)
                    .OrderBy(j => j.Deadline).Take(5).Select(j => new { j.Id, j.Company, j.Title, j.Deadline }),
                recentVersions = versions.Select(v => new
                {
                    v.Id, v.Number, v.ResumeName, v.ResumeId, v.CreatedAt, v.PageCount,
                    job = v.Job is null ? null : new { v.Job.Id, v.Job.Company, v.Job.Title },
                }),
            };
        });

        app.MapGet("/api/performance", async (AppDbContext db) => await PerformanceService.BuildAsync(db));

        app.MapPost("/api/import/rendercv", async (ImportInput input, AppDbContext db) =>
        {
            ImportResult parsed;
            try
            {
                parsed = YamlImporter.Parse(input.Yaml);
            }
            catch (Exception ex)
            {
                return Results.BadRequest(new { error = $"Could not read the YAML: {ex.Message}" });
            }

            if (input.ImportProfile && parsed.Profile is { } incoming)
            {
                var p = await db.GetProfileAsync();
                p.Name = incoming.Name;
                p.Headline = incoming.Headline ?? p.Headline;
                p.Location = incoming.Location ?? p.Location;
                p.Email = incoming.Email ?? p.Email;
                p.Phone = incoming.Phone ?? p.Phone;
                p.Website = incoming.Website ?? p.Website;
                if (incoming.SocialNetworks.Count > 0) p.SocialNetworks = incoming.SocialNetworks;
                if (incoming.CustomConnections.Count > 0) p.CustomConnections = incoming.CustomConnections;
                if (parsed.Theme is { } t && CvYamlBuilder.Themes.Contains(t)) p.DefaultDesign.Theme = t;
                if (parsed.Locale is { } l && CvYamlBuilder.Locales.Contains(l)) p.DefaultDesign.Locale = l;
            }

            var all = parsed.Sections.SelectMany(s => s.Fragments).ToList();
            db.Fragments.AddRange(all);
            await db.SaveChangesAsync();

            int? resumeId = null;
            if (input.CreateResume)
            {
                var profile = await db.GetProfileAsync();
                var resume = new Resume
                {
                    Name = string.IsNullOrWhiteSpace(input.ResumeName) ? "Imported resume" : input.ResumeName.Trim(),
                    Design = profile.DefaultDesign,
                    TargetPages = profile.DefaultTargetPages,
                    Sections = parsed.Sections.Where(s => s.Fragments.Count > 0).Select(s => new ResumeSection
                    {
                        Title = s.Title,
                        Items = s.Fragments.Select(f => new ResumeItem { FragmentId = f.Id }).ToList(),
                    }).ToList(),
                };
                if (parsed.Theme is { } t && CvYamlBuilder.Themes.Contains(t)) resume.Design.Theme = t;
                db.Resumes.Add(resume);
                await db.SaveChangesAsync();
                resumeId = resume.Id;
            }

            return Results.Ok(new
            {
                fragments = all.Count,
                sections = parsed.Sections.Select(s => new { s.Title, count = s.Fragments.Count }),
                resumeId,
                parsed.Warnings,
            });
        });

        app.MapGet("/api/export/library", async (AppDbContext db) =>
        {
            var export = new LibraryExport(1, DateTime.UtcNow, await db.GetProfileAsync(),
                await db.Fragments.AsNoTracking().ToListAsync(), await db.Jobs.AsNoTracking().ToListAsync());
            var bytes = JsonSerializer.SerializeToUtf8Bytes(export, new JsonSerializerOptions(AppDbContext.Json) { WriteIndented = true });
            return Results.File(bytes, "application/json", $"resume-library-{DateTime.Now:yyyy-MM-dd}.json");
        });

        app.MapPost("/api/import/library", async (LibraryExport input, AppDbContext db) =>
        {
            foreach (var f in input.Fragments)
            {
                f.Id = 0;
                db.Fragments.Add(f);
            }

            var jobs = 0;
            foreach (var j in input.Jobs ?? [])
            {
                j.Id = 0;
                j.SubmittedVersionId = null;
                db.Jobs.Add(j);
                jobs++;
            }

            await db.SaveChangesAsync();
            return Results.Ok(new { fragments = input.Fragments.Count, jobs });
        });

        // Full backup: a consistent copy of the database plus every generated PDF and uploaded photo.
        app.MapGet("/api/backup", async (AppPaths paths, AppDbContext db) =>
        {
            var staging = Path.Combine(Path.GetTempPath(), "resume-backup-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(staging);
            try
            {
                var dbCopy = Path.Combine(staging, "resume-builder.db");
                await using (var conn = new SqliteConnection($"Data Source={paths.DbPath}"))
                {
                    await conn.OpenAsync();
                    await using var cmd = conn.CreateCommand();
                    cmd.CommandText = "VACUUM INTO $path";
                    cmd.Parameters.AddWithValue("$path", dbCopy);
                    await cmd.ExecuteNonQueryAsync();
                }

                var ms = new MemoryStream();
                using (var zip = new ZipArchive(ms, ZipArchiveMode.Create, true))
                {
                    zip.CreateEntryFromFile(dbCopy, "resume-builder.db");
                    foreach (var dir in new[] { paths.VersionsDir, paths.UploadsDir })
                    foreach (var file in Directory.EnumerateFiles(dir, "*", SearchOption.AllDirectories))
                    {
                        var rel = Path.GetRelativePath(paths.DataDir, file);
                        if (rel.Contains(".tmp-")) continue;
                        zip.CreateEntryFromFile(file, rel.Replace('\\', '/'));
                    }
                }

                ms.Position = 0;
                return Results.File(ms, "application/zip", $"resume-builder-backup-{DateTime.Now:yyyy-MM-dd}.zip");
            }
            finally
            {
                Directory.Delete(staging, true);
            }
        });
    }
}
