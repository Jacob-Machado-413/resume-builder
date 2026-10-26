using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using ResumeBuilder.Api.Data;
using ResumeBuilder.Api.Endpoints;
using ResumeBuilder.Api.Models;

namespace ResumeBuilder.Api.Services;

/// <summary>What ultimately happened to one application, using the furthest stage the job ever reached.</summary>
public enum Outcome { Pending, NoResponse, Rejected, Interview, Offer, Withdrawn }

public record Tally(int Sent, int Pending, int NoResponse, int Rejected, int Interviews, int Offers)
{
    /// <summary>Applications with a known result; withdrawn and still-pending ones are excluded.</summary>
    public int Resolved => NoResponse + Rejected + Interviews;
    public double? InterviewRate => Resolved == 0 ? null : Math.Round((double)Interviews / Resolved, 3);
    public double? OfferRate => Resolved == 0 ? null : Math.Round((double)Offers / Resolved, 3);
    public string? Grade => PerformanceService.GradeFor(this);
    public bool LowConfidence => Resolved < PerformanceService.MinResolved;
}

public record ApplicationOutcome(
    int JobId, string Company, string Title, JobStatus Status, int VersionId, int VersionNumber, int ResumeId, string ResumeName,
    string? Theme, DateTime SentAt, Outcome Outcome, int DaysWaiting, bool Submitted);

public record ResumePerformance(int ResumeId, string Name, Tally Tally, List<ApplicationOutcome> Applications);

public record FragmentPerformance(int FragmentId, string Title, string Section, Tally Tally, double? Lift);

public record ThemePerformance(string Theme, Tally Tally);

public record PerformanceReport(
    Tally Overall, List<ResumePerformance> Resumes, List<FragmentPerformance> Fragments, List<ThemePerformance> Themes,
    List<ApplicationOutcome> Applications, int NoResponseAfterDays);

public static class PerformanceService
{
    /// <summary>An application still at "applied" after this many days counts as no response.</summary>
    public const int NoResponseAfterDays = 30;
    public const int MinResolved = 3;

    private static readonly JobStatus[] Reached = [JobStatus.Interviewing, JobStatus.Offer, JobStatus.Accepted];

    public static string? GradeFor(Tally t) => t.InterviewRate switch
    {
        null => null,
        >= 0.30 => "A",
        >= 0.20 => "B",
        >= 0.10 => "C",
        >= 0.05 => "D",
        _ => "F",
    };

    public static Outcome OutcomeOf(Job job, DateTime sentAt, DateTime now)
    {
        var seen = job.History.Select(h => h.Status).Append(job.Status).ToHashSet();
        if (seen.Contains(JobStatus.Offer) || seen.Contains(JobStatus.Accepted)) return Outcome.Offer;
        if (seen.Overlaps(Reached)) return Outcome.Interview;
        return job.Status switch
        {
            JobStatus.Rejected => Outcome.Rejected,
            JobStatus.Ghosted => Outcome.NoResponse,
            JobStatus.Withdrawn => Outcome.Withdrawn,
            _ when (now - (job.AppliedAt ?? sentAt)).TotalDays >= NoResponseAfterDays => Outcome.NoResponse,
            _ => Outcome.Pending,
        };
    }

    public static Tally Count(IEnumerable<ApplicationOutcome> apps)
    {
        var list = apps.Where(a => a.Outcome != Outcome.Withdrawn).ToList();
        return new Tally(
            list.Count,
            list.Count(a => a.Outcome == Outcome.Pending),
            list.Count(a => a.Outcome == Outcome.NoResponse),
            list.Count(a => a.Outcome == Outcome.Rejected),
            list.Count(a => a.Outcome is Outcome.Interview or Outcome.Offer),
            list.Count(a => a.Outcome == Outcome.Offer));
    }

    public static async Task<PerformanceReport> BuildAsync(AppDbContext db)
    {
        var now = DateTime.UtcNow;
        var jobs = await db.Jobs.AsNoTracking().Where(j => j.Status != JobStatus.Saved).ToListAsync();
        var versions = await db.Versions.AsNoTracking().Where(v => v.JobId != null).ToListAsync();
        var fragments = await db.Fragments.AsNoTracking().ToDictionaryAsync(f => f.Id);

        // The version that went out for each job: the one marked submitted, else the latest one linked to it.
        var apps = new List<ApplicationOutcome>();
        var sentVersions = new Dictionary<int, ResumeVersion>();
        foreach (var job in jobs)
        {
            var linked = versions.Where(v => v.JobId == job.Id).ToList();
            var v = linked.FirstOrDefault(x => x.Id == job.SubmittedVersionId) ?? linked.MaxBy(x => x.CreatedAt);
            if (v is null) continue;
            sentVersions[job.Id] = v;
            var sentAt = job.AppliedAt ?? v.CreatedAt;
            apps.Add(new ApplicationOutcome(job.Id, job.Company, job.Title, job.Status, v.Id, v.Number, v.ResumeId, v.ResumeName, v.Theme,
                sentAt, OutcomeOf(job, v.CreatedAt, now), (int)(now - sentAt).TotalDays, job.SubmittedVersionId == v.Id));
        }

        var overall = Count(apps);
        var resumeNames = await db.Resumes.AsNoTracking().ToDictionaryAsync(r => r.Id, r => r.Name);
        var byResume = apps.GroupBy(a => a.ResumeId)
            .Select(g => new ResumePerformance(g.Key, resumeNames.GetValueOrDefault(g.Key) ?? g.First().ResumeName, Count(g),
                g.OrderByDescending(a => a.SentAt).ToList()))
            .OrderByDescending(r => r.Tally.InterviewRate ?? -1).ThenByDescending(r => r.Tally.Sent)
            .ToList();

        var byTheme = apps.GroupBy(a => a.Theme ?? "classic")
            .Select(g => new ThemePerformance(g.Key, Count(g)))
            .OrderByDescending(t => t.Tally.Sent)
            .ToList();

        // Fragment usage comes from each version's frozen layout.
        var usage = new Dictionary<int, List<ApplicationOutcome>>();
        foreach (var app in apps)
        {
            var snapshot = sentVersions[app.JobId].Snapshot;
            if (snapshot is null) continue;
            var layout = JsonSerializer.Deserialize<ResumeSnapshot>(snapshot, AppDbContext.Json);
            foreach (var fid in layout?.Sections.SelectMany(s => s.Items).Select(i => i.FragmentId).Distinct() ?? [])
            {
                if (!usage.TryGetValue(fid, out var l)) usage[fid] = l = [];
                l.Add(app);
            }
        }

        var byFragment = usage
            .Where(kv => fragments.ContainsKey(kv.Key))
            .Select(kv =>
            {
                var t = Count(kv.Value);
                double? lift = t.InterviewRate is { } r && overall.InterviewRate is { } o ? Math.Round(r - o, 3) : null;
                var f = fragments[kv.Key];
                return new FragmentPerformance(f.Id, f.Title, f.Section, t, lift);
            })
            .OrderByDescending(f => f.Lift ?? double.MinValue).ThenByDescending(f => f.Tally.Sent)
            .ToList();

        return new PerformanceReport(overall, byResume, byFragment, byTheme, apps.OrderByDescending(a => a.SentAt).ToList(), NoResponseAfterDays);
    }
}
