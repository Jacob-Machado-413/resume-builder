using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using ResumeBuilder.Api.Data;
using ResumeBuilder.Api.Models;
using ResumeBuilder.Api.Services;

namespace ResumeBuilder.Api.Endpoints;

public record VersionUpdate(string? Label, string? Notes, int? JobId);

public static partial class VersionEndpoints
{
    public static async Task<object> ToDtoAsync(AppDbContext db, ResumeVersion v)
    {
        var job = v.Job ?? (v.JobId is { } jid ? await db.Jobs.AsNoTracking().FirstOrDefaultAsync(j => j.Id == jid) : null);
        return Dto(v, job);
    }

    private static object Dto(ResumeVersion v, Job? job) => new
    {
        v.Id, v.ResumeId, v.Number, v.ResumeName, v.Label, v.Notes, v.PageCount, v.Theme, v.CreatedAt, v.JobId,
        hasSnapshot = v.Snapshot is not null,
        job = job is null ? null : new { job.Id, job.Company, job.Title, job.Status, job.AppliedAt },
        submitted = job is not null && job.SubmittedVersionId == v.Id,
        pdfUrl = $"/api/versions/{v.Id}/pdf",
        pages = Enumerable.Range(1, v.PageCount).Select(n => $"/api/versions/{v.Id}/page/{n}").ToList(),
    };

    public static void DeleteFiles(ResumeVersion v, AppPaths paths)
    {
        if (string.IsNullOrEmpty(v.Folder)) return;
        var dir = Path.Combine(paths.VersionsDir, v.Folder);
        if (Directory.Exists(dir)) Directory.Delete(dir, true);
    }

    private static string? FileOf(ResumeVersion v, AppPaths paths, string name)
    {
        var f = Path.Combine(paths.VersionsDir, v.Folder, name);
        return File.Exists(f) ? f : null;
    }

    private static string DownloadName(ResumeVersion v, Profile p, string ext)
    {
        var parts = new[] { p.Name, v.Job?.Company, $"v{v.Number}" }.Where(s => !string.IsNullOrWhiteSpace(s));
        return SafeName().Replace(string.Join("_", parts), "_").Trim('_') + ext;
    }

    [GeneratedRegex(@"[^A-Za-z0-9._-]+")]
    private static partial Regex SafeName();

    public static void MapVersionEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/versions");

        g.MapGet("", async (int? jobId, int? resumeId, AppDbContext db) =>
        {
            var q = db.Versions.AsNoTracking().Include(v => v.Job).AsQueryable();
            if (jobId is not null) q = q.Where(v => v.JobId == jobId);
            if (resumeId is not null) q = q.Where(v => v.ResumeId == resumeId);
            var list = await q.OrderByDescending(v => v.CreatedAt).ToListAsync();
            return list.Select(v => Dto(v, v.Job));
        });

        g.MapGet("/{id:int}", async (int id, AppDbContext db) =>
            await db.Versions.Include(v => v.Job).FirstOrDefaultAsync(v => v.Id == id) is { } v
                ? Results.Ok(Dto(v, v.Job))
                : Results.NotFound());

        g.MapPut("/{id:int}", async (int id, VersionUpdate input, AppDbContext db) =>
        {
            if (await db.Versions.Include(v => v.Job).FirstOrDefaultAsync(v => v.Id == id) is not { } v) return Results.NotFound();
            v.Label = string.IsNullOrWhiteSpace(input.Label) ? null : input.Label.Trim();
            v.Notes = input.Notes;
            if (v.JobId != input.JobId)
            {
                if (v.Job is { } old && old.SubmittedVersionId == v.Id) old.SubmittedVersionId = null;
                v.JobId = input.JobId;
            }

            await db.SaveChangesAsync();
            v.Job = v.JobId is null ? null : await db.Jobs.FindAsync(v.JobId);
            return Results.Ok(Dto(v, v.Job));
        });

        g.MapDelete("/{id:int}", async (int id, AppDbContext db, AppPaths paths) =>
        {
            if (await db.Versions.FindAsync(id) is not { } v) return Results.NotFound();
            foreach (var j in await db.Jobs.Where(j => j.SubmittedVersionId == id).ToListAsync()) j.SubmittedVersionId = null;
            DeleteFiles(v, paths);
            db.Versions.Remove(v);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        g.MapGet("/{id:int}/pdf", async (int id, bool? download, AppDbContext db, AppPaths paths) =>
        {
            if (await db.Versions.Include(v => v.Job).FirstOrDefaultAsync(v => v.Id == id) is not { } v) return Results.NotFound();
            if (FileOf(v, paths, "resume.pdf") is not { } pdf) return Results.NotFound();
            var name = DownloadName(v, await db.GetProfileAsync(), ".pdf");
            return download == true
                ? Results.File(pdf, "application/pdf", name)
                : Results.File(pdf, "application/pdf", enableRangeProcessing: true);
        });

        g.MapGet("/{id:int}/page/{n:int}", async (int id, int n, AppDbContext db, AppPaths paths) =>
            await db.Versions.FindAsync(id) is { } v && FileOf(v, paths, $"page_{n}.png") is { } png
                ? Results.File(png, "image/png")
                : Results.NotFound());

        g.MapGet("/{id:int}/{kind:regex(^(yaml|markdown|typst)$)}", async (int id, string kind, bool? download, AppDbContext db, AppPaths paths) =>
        {
            if (await db.Versions.Include(v => v.Job).FirstOrDefaultAsync(v => v.Id == id) is not { } v) return Results.NotFound();
            var (file, ext, mime) = kind switch
            {
                "yaml" => ("cv.yaml", ".yaml", "text/yaml"),
                "markdown" => ("resume.md", ".md", "text/markdown"),
                _ => ("resume.typ", ".typ", "text/plain"),
            };
            var text = kind == "yaml" ? v.Yaml : FileOf(v, paths, file) is { } f ? await File.ReadAllTextAsync(f) : null;
            if (text is null) return Results.NotFound();
            if (download == true)
                return Results.File(System.Text.Encoding.UTF8.GetBytes(text), mime, DownloadName(v, await db.GetProfileAsync(), ext));
            return Results.Text(text, mime + "; charset=utf-8");
        });
    }
}
