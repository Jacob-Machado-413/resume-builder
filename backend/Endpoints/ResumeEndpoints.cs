using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using ResumeBuilder.Api.Data;
using ResumeBuilder.Api.Models;
using ResumeBuilder.Api.Services;

namespace ResumeBuilder.Api.Endpoints;

public record ResumeInput(
    string? Name, int? JobId, string? HeadlineOverride, List<ResumeSection>? Sections, DesignSettings? Design,
    int? TargetPages, string? Notes);

public record CreateResumeInput(string? Name, int? JobId, int? CloneFromId, int? FromVersionId, bool AutoFill = false);

public record GenerateInput(string? Label, string? Notes);

public record ResumeSnapshot(string? HeadlineOverride, List<ResumeSection> Sections, DesignSettings Design, int TargetPages);

public static class ResumeEndpoints
{
    public static object ToDto(Resume r, List<ResumeVersion> versions) => new
    {
        r.Id, r.Name, r.JobId, r.HeadlineOverride, r.Sections, r.Design, r.TargetPages, r.Notes, r.ClonedFromId,
        r.CreatedAt, r.UpdatedAt,
        job = r.Job is null ? null : new { r.Job.Id, r.Job.Company, r.Job.Title, r.Job.Status },
        itemCount = r.Sections.Sum(s => s.Items.Count),
        versionCount = versions.Count,
        latestVersion = versions.OrderByDescending(v => v.Number).Select(v => new { v.Id, v.Number, v.PageCount, v.CreatedAt }).FirstOrDefault(),
    };

    private static Resume Copy(ResumeSnapshot s, Resume target)
    {
        var json = JsonSerializer.Serialize(s, AppDbContext.Json);
        var clone = JsonSerializer.Deserialize<ResumeSnapshot>(json, AppDbContext.Json)!;
        target.HeadlineOverride = clone.HeadlineOverride;
        target.Sections = clone.Sections;
        target.Design = clone.Design;
        target.TargetPages = clone.TargetPages;
        return target;
    }

    private static void Apply(Resume r, ResumeInput input)
    {
        if (input.Name is not null) r.Name = string.IsNullOrWhiteSpace(input.Name) ? "Untitled resume" : input.Name.Trim();
        r.JobId = input.JobId;
        r.HeadlineOverride = input.HeadlineOverride;
        if (input.Sections is not null) r.Sections = input.Sections;
        if (input.Design is not null) r.Design = input.Design;
        if (input.TargetPages is { } tp) r.TargetPages = Math.Clamp(tp, 1, 5);
        r.Notes = input.Notes;
        r.UpdatedAt = DateTime.UtcNow;
    }

    /// <summary>Builds YAML for a resume (saved or draft) using the current profile and fragment library.</summary>
    public static async Task<BuildResult> BuildAsync(AppDbContext db, AppPaths paths, Resume resume, bool forPreview, Job? job = null)
    {
        var profile = await db.GetProfileAsync();
        var ids = resume.Sections.SelectMany(s => s.Items).Select(i => i.FragmentId).Distinct().ToList();
        var fragments = await db.Fragments.AsNoTracking().Where(f => ids.Contains(f.Id)).ToDictionaryAsync(f => f.Id);
        var title = job is null ? $"{profile.Name} - Resume" : $"{profile.Name} - Resume - {job.Company}";
        return CvYamlBuilder.Build(profile, resume, fragments, new BuildOptions(forPreview, profile.PhotoPath(paths), title));
    }

    public static async Task<string> ResumeTextAsync(AppDbContext db, Resume resume)
    {
        var ids = resume.Sections.SelectMany(s => s.Items).Select(i => i.FragmentId).Distinct().ToList();
        var fragments = await db.Fragments.AsNoTracking().Where(f => ids.Contains(f.Id)).ToDictionaryAsync(f => f.Id);
        var parts = resume.Sections.SelectMany(s => s.Items)
            .Where(i => fragments.ContainsKey(i.FragmentId))
            .Select(i => KeywordAnalyzer.FragmentText(CvYamlBuilder.ResolveContent(i, fragments[i.FragmentId])));
        return (resume.HeadlineOverride ?? (await db.GetProfileAsync()).Headline) + " " + string.Join(" ", parts);
    }

    public static void MapResumeEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/resumes");

        g.MapGet("", async (AppDbContext db) =>
        {
            var resumes = await db.Resumes.AsNoTracking().Include(r => r.Job).OrderByDescending(r => r.UpdatedAt).ToListAsync();
            var versions = (await db.Versions.AsNoTracking().Select(v => new ResumeVersion
                { Id = v.Id, ResumeId = v.ResumeId, Number = v.Number, PageCount = v.PageCount, CreatedAt = v.CreatedAt }).ToListAsync())
                .ToLookup(v => v.ResumeId);
            return resumes.Select(r => ToDto(r, versions[r.Id].ToList()));
        });

        g.MapGet("/{id:int}", async (int id, AppDbContext db) =>
        {
            if (await db.Resumes.Include(r => r.Job).FirstOrDefaultAsync(r => r.Id == id) is not { } r) return Results.NotFound();
            var versions = await db.Versions.AsNoTracking().Where(v => v.ResumeId == id).ToListAsync();
            return Results.Ok(ToDto(r, versions));
        });

        g.MapPost("", async (CreateResumeInput input, AppDbContext db) =>
        {
            var profile = await db.GetProfileAsync();
            var job = input.JobId is { } jid ? await db.Jobs.FindAsync(jid) : null;
            var r = new Resume
            {
                JobId = job?.Id,
                Design = profile.DefaultDesign,
                TargetPages = profile.DefaultTargetPages,
                Name = !string.IsNullOrWhiteSpace(input.Name) ? input.Name.Trim()
                    : job is not null ? $"{job.Company} – {job.Title}".Trim(' ', '–') : "Untitled resume",
            };

            if (input.CloneFromId is { } cid)
            {
                if (await db.Resumes.AsNoTracking().FirstOrDefaultAsync(x => x.Id == cid) is not { } src)
                    return Results.BadRequest(new { error = "Resume to clone was not found." });
                Copy(new ResumeSnapshot(src.HeadlineOverride, src.Sections, src.Design, src.TargetPages), r);
                foreach (var s in r.Sections)
                {
                    s.Id = Ids.New();
                    foreach (var i in s.Items) i.Id = Ids.New();
                }

                r.ClonedFromId = cid;
                if (string.IsNullOrWhiteSpace(input.Name) && job is null) r.Name = src.Name + " (copy)";
            }
            else if (input.FromVersionId is { } vid)
            {
                if (await db.Versions.AsNoTracking().FirstOrDefaultAsync(v => v.Id == vid) is not { Snapshot: { } snap } v)
                    return Results.BadRequest(new { error = "That version has no layout snapshot to branch from." });
                Copy(JsonSerializer.Deserialize<ResumeSnapshot>(snap, AppDbContext.Json)!, r);
                r.ClonedFromId = v.ResumeId;
                if (string.IsNullOrWhiteSpace(input.Name) && job is null) r.Name = $"{v.ResumeName} (from v{v.Number})";
            }
            else
            {
                var library = await db.Fragments.AsNoTracking().Where(f => !f.Archived).ToListAsync();
                r.Sections = input.AutoFill && job is not null ? BestMatchSections(library, job) : DefaultSections(library);
            }

            db.Resumes.Add(r);
            await db.SaveChangesAsync();
            await db.Entry(r).Reference(x => x.Job).LoadAsync();
            return Results.Ok(ToDto(r, []));
        });

        g.MapPut("/{id:int}", async (int id, ResumeInput input, AppDbContext db) =>
        {
            if (await db.Resumes.Include(r => r.Job).FirstOrDefaultAsync(r => r.Id == id) is not { } r) return Results.NotFound();
            Apply(r, input);
            await db.SaveChangesAsync();
            await db.Entry(r).Reference(x => x.Job).LoadAsync();
            var versions = await db.Versions.AsNoTracking().Where(v => v.ResumeId == id).ToListAsync();
            return Results.Ok(ToDto(r, versions));
        });

        g.MapDelete("/{id:int}", async (int id, AppDbContext db, AppPaths paths) =>
        {
            if (await db.Resumes.FindAsync(id) is not { } r) return Results.NotFound();
            var versions = await db.Versions.Where(v => v.ResumeId == id).ToListAsync();
            foreach (var v in versions) VersionEndpoints.DeleteFiles(v, paths);
            var versionIds = versions.Select(v => v.Id).ToList();
            foreach (var j in await db.Jobs.Where(j => j.SubmittedVersionId != null && versionIds.Contains(j.SubmittedVersionId.Value)).ToListAsync())
                j.SubmittedVersionId = null;
            db.Resumes.Remove(r);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        g.MapGet("/{id:int}/yaml", async (int id, AppDbContext db, AppPaths paths) =>
        {
            if (await db.Resumes.Include(r => r.Job).FirstOrDefaultAsync(r => r.Id == id) is not { } r) return Results.NotFound();
            var build = await BuildAsync(db, paths, r, false, r.Job);
            return Results.Text(build.Yaml, "text/yaml");
        });

        g.MapPost("/{id:int}/generate", async (int id, GenerateInput input, AppDbContext db, AppPaths paths, RenderCvService render, CancellationToken ct) =>
        {
            if (await db.Resumes.Include(r => r.Job).FirstOrDefaultAsync(r => r.Id == id, ct) is not { } r) return Results.NotFound();
            var build = await BuildAsync(db, paths, r, false, r.Job);
            var tmp = Path.Combine(paths.VersionsDir, ".tmp-" + Guid.NewGuid().ToString("N"));
            var outcome = await render.RenderAsync(build.Yaml, build.PhotoPath, tmp, full: true, ct);
            if (!outcome.Success || outcome.Pdf is null)
            {
                if (Directory.Exists(tmp)) Directory.Delete(tmp, true);
                return Results.BadRequest(new { error = outcome.Error ?? "rendercv did not produce a PDF.", warnings = build.Warnings });
            }

            var number = (await db.Versions.Where(v => v.ResumeId == id).MaxAsync(v => (int?)v.Number, ct) ?? 0) + 1;
            var version = new ResumeVersion
            {
                ResumeId = id, JobId = r.JobId, Number = number, ResumeName = r.Name,
                Label = string.IsNullOrWhiteSpace(input.Label) ? null : input.Label.Trim(), Notes = input.Notes,
                Yaml = build.Yaml, PageCount = outcome.PagePngs.Count, Theme = r.Design.Theme,
                Snapshot = JsonSerializer.Serialize(new ResumeSnapshot(r.HeadlineOverride, r.Sections, r.Design, r.TargetPages), AppDbContext.Json),
            };
            db.Versions.Add(version);
            await db.SaveChangesAsync(ct);

            version.Folder = version.Id.ToString();
            var final = Path.Combine(paths.VersionsDir, version.Folder);
            if (Directory.Exists(final)) Directory.Delete(final, true);
            Directory.Move(tmp, final);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { version = await VersionEndpoints.ToDtoAsync(db, version), warnings = build.Warnings });
        });

        // Live preview of an unsaved draft. Includes keyword coverage when the draft targets a job.
        app.MapPost("/api/preview", async (ResumeInput input, AppDbContext db, AppPaths paths, RenderCvService render, CancellationToken ct) =>
        {
            var draft = new Resume();
            Apply(draft, input);
            var job = input.JobId is { } jid ? await db.Jobs.AsNoTracking().FirstOrDefaultAsync(j => j.Id == jid, ct) : null;
            var build = await BuildAsync(db, paths, draft, true, job);
            var preview = await render.PreviewAsync(build, draft.Design.Theme, draft.Design.PageSize, draft.Design.Margin, ct);

            Coverage? coverage = null;
            if (job is not null && !string.IsNullOrWhiteSpace(job.Description))
                coverage = KeywordAnalyzer.Cover(await ResumeTextAsync(db, draft), KeywordAnalyzer.Extract(job.Description, ignore: job.Company));

            return Results.Ok(new
            {
                preview.Key, preview.PageCount, preview.Pages, preview.Warnings, preview.Error, preview.Yaml, coverage,
                targetPages = draft.TargetPages,
            });
        });

        // First page of the resume as it stands now; renders are cached by content, so repeat calls are cheap.
        g.MapGet("/{id:int}/thumbnail", async (int id, AppDbContext db, AppPaths paths, RenderCvService render, CancellationToken ct) =>
        {
            if (await db.Resumes.AsNoTracking().Include(r => r.Job).FirstOrDefaultAsync(r => r.Id == id, ct) is not { } r) return Results.NotFound();
            if (r.Sections.All(s => s.Items.Count == 0)) return Results.NotFound();
            var build = await BuildAsync(db, paths, r, true, r.Job);
            var preview = await render.PreviewAsync(build, r.Design.Theme, r.Design.PageSize, r.Design.Margin, ct);
            return preview.Pages.Count > 0 && render.PreviewPage(preview.Key, 1) is { } file
                ? Results.File(file, "image/png")
                : Results.NotFound();
        });

        app.MapGet("/api/preview/{key}/{page:int}", (string key, int page, RenderCvService render) =>
            render.PreviewPage(key, page) is { } file ? Results.File(file, "image/png") : Results.NotFound());
    }

    private static readonly string[] SectionOrder = ["summary", "profile", "about", "experience", "work", "employment", "education", "projects", "skills", "publications"];

    private static string DateKey(FragmentContent c) =>
        c.EndDate is "present" || (!string.IsNullOrEmpty(c.StartDate) && string.IsNullOrEmpty(c.EndDate)) ? "9999"
            : c.EndDate ?? c.Date ?? c.StartDate ?? "";

    /// <summary>
    /// Picks pinned fragments plus those that match the job posting well, keeps one entry type per section,
    /// orders dated entries newest first, and puts the summary on top. The page gauge then shows what to trim.
    /// </summary>
    public static List<ResumeSection> BestMatchSections(List<Fragment> library, Job job)
    {
        var keywords = KeywordAnalyzer.Extract(job.Description, ignore: job.Company);
        if (keywords.Count == 0) return DefaultSections(library);
        var scores = KeywordAnalyzer.Rank(library, keywords).ToDictionary(s => s.FragmentId, s => s.Score);
        var best = scores.Values.DefaultIfEmpty(0).Max();
        var chosen = library.Where(f => f.Pinned || (best > 0 && scores[f.Id] >= best * 0.3)).ToList();

        var sections = new List<(ResumeSection Section, double Score)>();
        foreach (var grp in chosen.GroupBy(f => f.Section))
        {
            var type = grp.OrderByDescending(f => scores[f.Id]).First().Type;
            var items = grp.Where(f => f.Type == type).ToList();
            items = type switch
            {
                EntryType.Text => items.OrderByDescending(f => f.Pinned).ThenByDescending(f => scores[f.Id]).Take(1).ToList(),
                EntryType.Experience or EntryType.Education or EntryType.Normal or EntryType.Publication =>
                    items.OrderByDescending(f => DateKey(f.Content), StringComparer.Ordinal).ToList(),
                _ => items.OrderByDescending(f => scores[f.Id]).ToList(),
            };
            sections.Add((new ResumeSection { Title = grp.Key, Items = items.Select(f => new ResumeItem { FragmentId = f.Id }).ToList() },
                items.Max(f => scores[f.Id])));
        }

        int Rank(ResumeSection s, double score)
        {
            if (s.Items.Count > 0 && library.First(f => f.Id == s.Items[0].FragmentId).Type == EntryType.Text) return -1;
            var i = Array.FindIndex(SectionOrder, k => s.Title.Contains(k, StringComparison.OrdinalIgnoreCase));
            return i >= 0 ? i : SectionOrder.Length;
        }

        return sections.OrderBy(x => Rank(x.Section, x.Score)).ThenByDescending(x => x.Score).Select(x => x.Section).ToList();
    }

    /// <summary>A new blank resume starts with the library's pinned fragments, grouped by their default sections.</summary>
    private static List<ResumeSection> DefaultSections(List<Fragment> fragments) =>
        fragments.Where(f => f.Pinned)
            .GroupBy(f => f.Section)
            .Select(grp => new ResumeSection
            {
                Title = grp.Key,
                Items = grp.Select(f => new ResumeItem { FragmentId = f.Id }).ToList(),
            })
            .ToList();
}
