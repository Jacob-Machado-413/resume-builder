using Microsoft.EntityFrameworkCore;
using ResumeBuilder.Api.Data;
using ResumeBuilder.Api.Models;
using ResumeBuilder.Api.Services;

namespace ResumeBuilder.Api.Endpoints;

public record JobInput(
    string Company, string Title, string? Url, string? Location, string? Salary, string? Contact, string? Description,
    string? Notes, JobStatus Status, DateTime? AppliedAt, DateTime? Deadline);

public record StatusInput(JobStatus Status, string? Note);

public record SubmitInput(int? VersionId);

public static class JobEndpoints
{
    public static object ToDto(Job j, int resumeCount, int versionCount) => new
    {
        j.Id, j.Company, j.Title, j.Url, j.Location, j.Salary, j.Contact, j.Description, j.Notes, j.Status, j.History,
        j.AppliedAt, j.Deadline, j.SubmittedVersionId, j.CreatedAt, j.UpdatedAt, resumeCount, versionCount,
    };

    private static void SetStatus(Job j, JobStatus status, string? note)
    {
        if (j.Status == status && note is null) return;
        j.Status = status;
        j.History.Add(new StatusChange { Status = status, Note = note });
        if (status == JobStatus.Applied && j.AppliedAt is null) j.AppliedAt = DateTime.UtcNow;
    }

    public static void MapJobEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/jobs");

        g.MapGet("", async (AppDbContext db) =>
        {
            var resumeCounts = await db.Resumes.Where(r => r.JobId != null).GroupBy(r => r.JobId!.Value)
                .Select(x => new { x.Key, Count = x.Count() }).ToDictionaryAsync(x => x.Key, x => x.Count);
            var versionCounts = await db.Versions.Where(v => v.JobId != null).GroupBy(v => v.JobId!.Value)
                .Select(x => new { x.Key, Count = x.Count() }).ToDictionaryAsync(x => x.Key, x => x.Count);
            var jobs = await db.Jobs.AsNoTracking().OrderByDescending(j => j.UpdatedAt).ToListAsync();
            return jobs.Select(j => ToDto(j, resumeCounts.GetValueOrDefault(j.Id), versionCounts.GetValueOrDefault(j.Id)));
        });

        g.MapGet("/{id:int}", async (int id, AppDbContext db) =>
        {
            if (await db.Jobs.FindAsync(id) is not { } j) return Results.NotFound();
            return Results.Ok(ToDto(j, await db.Resumes.CountAsync(r => r.JobId == id), await db.Versions.CountAsync(v => v.JobId == id)));
        });

        g.MapPost("", async (JobInput input, AppDbContext db) =>
        {
            var j = new Job();
            Apply(j, input);
            j.History.Add(new StatusChange { Status = j.Status, Note = "Created" });
            if (j.Status == JobStatus.Applied) j.AppliedAt ??= DateTime.UtcNow;
            db.Jobs.Add(j);
            await db.SaveChangesAsync();
            return Results.Ok(ToDto(j, 0, 0));
        });

        g.MapPut("/{id:int}", async (int id, JobInput input, AppDbContext db) =>
        {
            if (await db.Jobs.FindAsync(id) is not { } j) return Results.NotFound();
            var oldStatus = j.Status;
            Apply(j, input);
            if (oldStatus != input.Status)
            {
                j.Status = oldStatus;
                SetStatus(j, input.Status, null);
            }

            await db.SaveChangesAsync();
            return Results.Ok(ToDto(j, await db.Resumes.CountAsync(r => r.JobId == id), await db.Versions.CountAsync(v => v.JobId == id)));
        });

        g.MapPost("/{id:int}/status", async (int id, StatusInput input, AppDbContext db) =>
        {
            if (await db.Jobs.FindAsync(id) is not { } j) return Results.NotFound();
            SetStatus(j, input.Status, string.IsNullOrWhiteSpace(input.Note) ? null : input.Note);
            j.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            return Results.Ok(ToDto(j, await db.Resumes.CountAsync(r => r.JobId == id), await db.Versions.CountAsync(v => v.JobId == id)));
        });

        // Marks which generated PDF was actually sent, and moves the job to Applied.
        g.MapPost("/{id:int}/submit", async (int id, SubmitInput input, AppDbContext db) =>
        {
            if (await db.Jobs.FindAsync(id) is not { } j) return Results.NotFound();
            if (input.VersionId is { } vid)
            {
                if (await db.Versions.FindAsync(vid) is not { } v) return Results.BadRequest(new { error = "Version not found." });
                v.JobId = id;
                j.SubmittedVersionId = vid;
                if (j.Status == JobStatus.Saved) SetStatus(j, JobStatus.Applied, $"Submitted resume v{v.Number}");
            }
            else j.SubmittedVersionId = null;

            j.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            return Results.Ok(ToDto(j, await db.Resumes.CountAsync(r => r.JobId == id), await db.Versions.CountAsync(v => v.JobId == id)));
        });

        g.MapDelete("/{id:int}", async (int id, AppDbContext db) =>
        {
            if (await db.Jobs.FindAsync(id) is not { } j) return Results.NotFound();
            db.Jobs.Remove(j);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        g.MapGet("/{id:int}/keywords", async (int id, AppDbContext db) =>
        {
            if (await db.Jobs.FindAsync(id) is not { } j) return Results.NotFound();
            var keywords = KeywordAnalyzer.Extract(j.Description, ignore: j.Company);
            var fragments = await db.Fragments.AsNoTracking().Where(f => !f.Archived).ToListAsync();
            return Results.Ok(new { keywords, ranking = KeywordAnalyzer.Rank(fragments, keywords) });
        });
    }

    private static void Apply(Job j, JobInput input)
    {
        j.Company = input.Company?.Trim() ?? "";
        j.Title = input.Title?.Trim() ?? "";
        j.Url = input.Url;
        j.Location = input.Location;
        j.Salary = input.Salary;
        j.Contact = input.Contact;
        j.Description = input.Description;
        j.Notes = input.Notes;
        j.Status = input.Status;
        j.AppliedAt = input.AppliedAt;
        j.Deadline = input.Deadline;
        j.UpdatedAt = DateTime.UtcNow;
    }
}
