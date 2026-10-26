using System.Text.RegularExpressions;
using ResumeBuilder.Api.Models;

namespace ResumeBuilder.Api.Services;

public record Keyword(string Term, int Count, double Weight);

public record FragmentScore(int FragmentId, double Score, List<string> Matched);

public record Coverage(List<string> Covered, List<string> Missing, double Ratio);

/// <summary>Offline keyword extraction and matching between a job description and fragments.</summary>
public static partial class KeywordAnalyzer
{
    private static readonly HashSet<string> Stop = new(StringComparer.OrdinalIgnoreCase)
    {
        "a","about","above","across","after","again","against","all","also","am","an","and","any","are","as","at","be",
        "because","been","before","being","below","between","both","but","by","can","could","did","do","does","doing",
        "down","during","each","etc","every","few","for","from","further","get","had","has","have","having","he","her",
        "here","hers","him","his","how","i","if","in","into","is","it","its","itself","just","like","may","me","more",
        "most","must","my","no","nor","not","now","of","off","on","once","one","only","or","other","our","ours","out",
        "over","own","per","plus","same","she","should","so","some","such","than","that","the","their","them","then",
        "there","these","they","this","those","through","to","too","under","until","up","us","very","via","was","we",
        "well","were","what","when","where","which","while","who","whom","why","will","with","within","without","would",
        "you","your","yours","yourself","able","ability","including","include","includes","new","work","working","role",
        "team","teams","join","looking","seeking","candidate","candidates","position","job","company","year","years",
        "experience","experienced","strong","excellent","good","great","skills","skill","knowledge","understanding",
        "requirements","required","preferred","responsibilities","qualifications","bonus","nice","have","help","ensure",
        "opportunity","benefits","salary","equal","employer","applicants","race","color","religion","gender","sexual",
        "orientation","national","origin","disability","veteran","status","age","related","field","degree","using",
        "use","build","building","across","within","other","make","based","day","days","time","part","full","high",
        "level","senior","junior","mid","lead","world","best","want","need","needs","love","passionate","passion",
        "environment","culture","impact","what","youll","you'll","we're","were","it's","our","etc.","e.g.","i.e.",
        "hiring","hire","apply","applying","join","joining","plus","ideal","ideally","familiarity","familiar","proven",
        "track","record","demonstrated","proficiency","proficient","hands-on","minimum","least","years'","solid","deep",
    };

    public static List<Keyword> Extract(string? text, int max = 40, string? ignore = null)
    {
        if (string.IsNullOrWhiteSpace(text)) return [];
        // The employer's own name is everywhere in a posting and never belongs on the resume.
        var ignored = ignore is null ? [] : Tokenize(ignore).ToHashSet();
        var tokens = Tokenize(text).Where(t => !ignored.Contains(t)).ToList();
        var counts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

        foreach (var t in tokens.Where(IsMeaningful)) counts[t] = counts.GetValueOrDefault(t) + 1;

        // Two-word phrases ("machine learning", "distributed systems") that recur are strong signals.
        for (var i = 0; i + 1 < tokens.Count; i++)
        {
            if (!IsMeaningful(tokens[i]) || !IsMeaningful(tokens[i + 1])) continue;
            var phrase = tokens[i] + " " + tokens[i + 1];
            counts[phrase] = counts.GetValueOrDefault(phrase) + 1;
        }

        return counts
            .Where(kv => !kv.Key.Contains(' ') || kv.Value >= 2)
            .Select(kv => new Keyword(kv.Key, kv.Value, kv.Value * (kv.Key.Contains(' ') ? 2.0 : 1.0) * (LooksTechnical(kv.Key) ? 1.5 : 1.0)))
            .OrderByDescending(k => k.Weight)
            .ThenBy(k => k.Term)
            .Take(max)
            .ToList();
    }

    public static string FragmentText(FragmentContent c) => string.Join(" ", new[]
    {
        c.Text, c.Company, c.Position, c.Institution, c.Area, c.Degree, c.Name, c.Title, c.Journal, c.Label, c.Details,
        c.Location, c.Summary,
    }.Concat(c.Highlights.Select(h => h.Text)).Concat(c.Authors).Where(s => !string.IsNullOrWhiteSpace(s)));

    public static bool Contains(string haystackLower, string term)
    {
        var t = term.ToLowerInvariant();
        var idx = haystackLower.IndexOf(t, StringComparison.Ordinal);
        while (idx >= 0)
        {
            var beforeOk = idx == 0 || !char.IsLetterOrDigit(haystackLower[idx - 1]);
            var end = idx + t.Length;
            var afterOk = end >= haystackLower.Length || !char.IsLetterOrDigit(haystackLower[end]) || haystackLower[end] == 's';
            if (beforeOk && afterOk) return true;
            idx = haystackLower.IndexOf(t, idx + 1, StringComparison.Ordinal);
        }

        return false;
    }

    public static List<FragmentScore> Rank(IEnumerable<Fragment> fragments, List<Keyword> keywords)
    {
        if (keywords.Count == 0) return [];
        return fragments
            .Select(f =>
            {
                var text = (FragmentText(f.Content) + " " + string.Join(" ", f.Tags) + " " + f.Title).ToLowerInvariant();
                var matched = keywords.Where(k => Contains(text, k.Term)).ToList();
                var max = keywords.Sum(k => k.Weight);
                return new FragmentScore(f.Id, Math.Round(matched.Sum(k => k.Weight) / max, 4), matched.Select(k => k.Term).ToList());
            })
            .OrderByDescending(s => s.Score)
            .ToList();
    }

    public static Coverage Cover(string resumeText, List<Keyword> keywords)
    {
        var lower = resumeText.ToLowerInvariant();
        var covered = keywords.Where(k => Contains(lower, k.Term)).Select(k => k.Term).ToList();
        var missing = keywords.Select(k => k.Term).Except(covered).ToList();
        return new Coverage(covered, missing, keywords.Count == 0 ? 0 : Math.Round((double)covered.Count / keywords.Count, 3));
    }

    private static List<string> Tokenize(string text) =>
        TokenRegex().Matches(text)
            .Select(m => m.Value.TrimEnd('.', '-', '/', '\'').TrimStart('-', '/', '\'').ToLowerInvariant())
            .Where(t => t.Length > 0)
            .ToList();

    private static bool IsMeaningful(string t) =>
        !Stop.Contains(t) && (t.Length > 2 || LooksTechnical(t) || t is "go" or "ai" or "ml" or "ui" or "ux" or "qa" or "r")
        && !t.All(char.IsDigit);

    private static bool LooksTechnical(string t) => t.Any(c => c is '#' or '+' or '.') || t.Any(char.IsDigit);

    // Keeps tokens like c#, c++, .net, node.js, ci/cd and k8s together.
    [GeneratedRegex(@"[A-Za-z0-9][A-Za-z0-9#+./'-]*|\.[A-Za-z]+")]
    private static partial Regex TokenRegex();
}
