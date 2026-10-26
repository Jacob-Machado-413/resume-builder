using Microsoft.EntityFrameworkCore;
using ResumeBuilder.Api.Data;
using ResumeBuilder.Api.Models;

namespace ResumeBuilder.Api.Endpoints;

public record FragmentInput(
    string Title, string Section, EntryType Type, FragmentContent Content, List<string>? Tags, string? Notes, bool Archived, bool Pinned);

public record FragmentDto(
    int Id, string Title, string Section, EntryType Type, FragmentContent Content, List<string> Tags, string? Notes,
    bool Archived, bool Pinned, DateTime CreatedAt, DateTime UpdatedAt, int UsageCount, List<int> UsedInResumeIds);

public static class FragmentEndpoints
{
    public static FragmentDto ToDto(Fragment f, IReadOnlyDictionary<int, List<int>> usage) =>
        new(f.Id, f.Title, f.Section, f.Type, f.Content, f.Tags, f.Notes, f.Archived, f.Pinned, f.CreatedAt, f.UpdatedAt,
            usage.TryGetValue(f.Id, out var r) ? r.Count : 0, usage.TryGetValue(f.Id, out var ids) ? ids : []);

    /// <summary>Maps fragment id to the resumes that currently include it.</summary>
    public static async Task<Dictionary<int, List<int>>> UsageAsync(this AppDbContext db)
    {
        var resumes = await db.Resumes.AsNoTracking().Select(r => new { r.Id, r.Sections }).ToListAsync();
        var usage = new Dictionary<int, List<int>>();
        foreach (var r in resumes)
        foreach (var fid in r.Sections.SelectMany(s => s.Items).Select(i => i.FragmentId).Distinct())
        {
            if (!usage.TryGetValue(fid, out var list)) usage[fid] = list = [];
            list.Add(r.Id);
        }

        return usage;
    }

    private static void Apply(Fragment f, FragmentInput input)
    {
        f.Title = string.IsNullOrWhiteSpace(input.Title) ? "Untitled fragment" : input.Title.Trim();
        f.Section = string.IsNullOrWhiteSpace(input.Section) ? "Experience" : input.Section.Trim();
        f.Type = input.Type;
        f.Content = input.Content ?? new FragmentContent();
        foreach (var h in f.Content.Highlights.Where(h => string.IsNullOrEmpty(h.Id))) h.Id = Ids.New();
        f.Tags = (input.Tags ?? []).Select(t => t.Trim()).Where(t => t.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        f.Notes = input.Notes;
        f.Archived = input.Archived;
        f.Pinned = input.Pinned;
        f.UpdatedAt = DateTime.UtcNow;
    }

    public static void MapFragmentEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/fragments");

        g.MapGet("", async (AppDbContext db) =>
        {
            var usage = await db.UsageAsync();
            var list = await db.Fragments.AsNoTracking().ToListAsync();
            return list.OrderBy(f => f.Section).ThenByDescending(f => f.Pinned).ThenByDescending(f => f.UpdatedAt)
                .Select(f => ToDto(f, usage));
        });

        g.MapGet("/{id:int}", async (int id, AppDbContext db) =>
            await db.Fragments.FindAsync(id) is { } f ? Results.Ok(ToDto(f, await db.UsageAsync())) : Results.NotFound());

        g.MapPost("", async (FragmentInput input, AppDbContext db) =>
        {
            var f = new Fragment();
            Apply(f, input);
            db.Fragments.Add(f);
            await db.SaveChangesAsync();
            return Results.Created($"/api/fragments/{f.Id}", ToDto(f, new Dictionary<int, List<int>>()));
        });

        g.MapPut("/{id:int}", async (int id, FragmentInput input, AppDbContext db) =>
        {
            if (await db.Fragments.FindAsync(id) is not { } f) return Results.NotFound();
            Apply(f, input);
            await db.SaveChangesAsync();
            return Results.Ok(ToDto(f, await db.UsageAsync()));
        });

        g.MapPost("/{id:int}/duplicate", async (int id, AppDbContext db) =>
        {
            if (await db.Fragments.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id) is not { } src) return Results.NotFound();
            var copy = new Fragment
            {
                Title = src.Title + " (copy)", Section = src.Section, Type = src.Type, Content = src.Content, Tags = src.Tags,
                Notes = src.Notes,
            };
            // Fresh highlight ids keep resume selections of the original from leaking onto the copy.
            foreach (var h in copy.Content.Highlights) h.Id = Ids.New();
            db.Fragments.Add(copy);
            await db.SaveChangesAsync();
            return Results.Ok(ToDto(copy, new Dictionary<int, List<int>>()));
        });

        g.MapDelete("/{id:int}", async (int id, AppDbContext db) =>
        {
            if (await db.Fragments.FindAsync(id) is not { } f) return Results.NotFound();
            // Drafts drop the fragment; generated versions keep their frozen YAML.
            foreach (var r in await db.Resumes.ToListAsync())
            foreach (var s in r.Sections)
                s.Items.RemoveAll(i => i.FragmentId == id);
            db.Fragments.Remove(f);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        app.MapGet("/api/sections", async (AppDbContext db) =>
        {
            var list = await db.Fragments.AsNoTracking().Select(f => new { f.Section, f.Type }).ToListAsync();
            return list.GroupBy(x => x.Section)
                .Select(grp => new { title = grp.Key, type = grp.GroupBy(x => x.Type).OrderByDescending(t => t.Count()).First().Key, count = grp.Count() })
                .OrderBy(x => x.title);
        });

        app.MapGet("/api/tags", async (AppDbContext db) =>
        {
            var tags = await db.Fragments.AsNoTracking().Select(f => f.Tags).ToListAsync();
            return tags.SelectMany(t => t).GroupBy(t => t, StringComparer.OrdinalIgnoreCase)
                .Select(grp => new { tag = grp.Key, count = grp.Count() }).OrderByDescending(x => x.count).ThenBy(x => x.tag);
        });
    }
}
