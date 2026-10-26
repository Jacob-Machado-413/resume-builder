using ResumeBuilder.Api.Models;
using YamlDotNet.Serialization;

namespace ResumeBuilder.Api.Services;

public record ImportedSection(string Title, List<Fragment> Fragments);

public record ImportResult(Profile? Profile, List<ImportedSection> Sections, string? Theme, string? Locale, List<string> Warnings);

/// <summary>Reads an existing rendercv YAML file and splits it into a profile plus library fragments.</summary>
public static class YamlImporter
{
    public static ImportResult Parse(string yaml)
    {
        var warnings = new List<string>();
        var root = CvYamlBuilder.Normalize(new DeserializerBuilder().Build().Deserialize<object>(yaml)) as Dictionary<string, object?>
                   ?? throw new FormatException("The file is not a YAML mapping.");

        if (Map(root, "cv") is not { } cv) throw new FormatException("No top-level \"cv\" key found. Is this a rendercv file?");

        var profile = new Profile
        {
            Name = Str(cv, "name") ?? "Your Name",
            Headline = Str(cv, "headline") ?? Str(cv, "label"),
            Location = Str(cv, "location"),
            Email = FirstStr(cv, "email"),
            Phone = FirstStr(cv, "phone"),
            Website = FirstStr(cv, "website"),
        };

        if (cv.GetValueOrDefault("social_networks") is List<object?> socials)
        {
            foreach (var s in socials.OfType<Dictionary<string, object?>>())
                profile.SocialNetworks.Add(new SocialLink { Network = Str(s, "network") ?? "LinkedIn", Username = Str(s, "username") ?? "" });
        }

        if (cv.GetValueOrDefault("custom_connections") is List<object?> customs)
        {
            foreach (var c in customs.OfType<Dictionary<string, object?>>())
                profile.CustomConnections.Add(new CustomConnection
                {
                    Placeholder = Str(c, "placeholder") ?? "", Url = Str(c, "url"), FontawesomeIcon = Str(c, "fontawesome_icon") ?? "link",
                });
        }

        var sections = new List<ImportedSection>();
        if (Map(cv, "sections") is { } secs)
        {
            foreach (var (key, value) in secs)
            {
                var title = Humanize(key);
                if (value is not List<object?> entries)
                {
                    warnings.Add($"Section \"{title}\" is not a list and was skipped.");
                    continue;
                }

                var fragments = new List<Fragment>();
                var index = 0;
                foreach (var entry in entries)
                {
                    index++;
                    var fragment = ToFragment(entry, title, index);
                    if (fragment is null) warnings.Add($"Entry {index} of \"{title}\" wasn't recognised and was skipped.");
                    else fragments.Add(fragment);
                }

                sections.Add(new ImportedSection(title, fragments));
            }
        }

        var theme = Map(root, "design") is { } design ? Str(design, "theme") : null;
        var locale = Map(root, "locale") is { } loc ? Str(loc, "language") : null;
        return new ImportResult(profile, sections, theme, locale, warnings);
    }

    private static Fragment? ToFragment(object? entry, string section, int index)
    {
        if (entry is string s)
            return new Fragment { Section = section, Type = EntryType.Text, Title = Shorten(s), Content = new FragmentContent { Text = s } };

        if (entry is not Dictionary<string, object?> e) return null;

        var c = new FragmentContent
        {
            Date = Str(e, "date"), StartDate = Str(e, "start_date"), EndDate = Str(e, "end_date"),
            Location = Str(e, "location"), Summary = Str(e, "summary"),
            Highlights = e.GetValueOrDefault("highlights") is List<object?> hs
                ? hs.Select(h => new Highlight { Text = h?.ToString() ?? "" }).ToList()
                : [],
        };

        Fragment F(EntryType type, string title) => new() { Section = section, Type = type, Title = title, Content = c };

        if (Str(e, "company") is { } company)
        {
            c.Company = company;
            c.Position = Str(e, "position");
            return F(EntryType.Experience, Shorten(c.Position is null ? company : $"{company} – {c.Position}"));
        }

        if (Str(e, "institution") is { } inst)
        {
            c.Institution = inst;
            c.Area = Str(e, "area");
            c.Degree = Str(e, "degree");
            return F(EntryType.Education, Shorten($"{inst}{(c.Degree is null ? "" : $" – {c.Degree}")}"));
        }

        if (e.ContainsKey("authors") || (e.ContainsKey("title") && (e.ContainsKey("doi") || e.ContainsKey("journal"))))
        {
            c.Title = Str(e, "title");
            c.Authors = e.GetValueOrDefault("authors") is List<object?> a ? a.Select(x => x?.ToString() ?? "").ToList() : [];
            c.Doi = Str(e, "doi");
            c.Url = Str(e, "url");
            c.Journal = Str(e, "journal");
            return F(EntryType.Publication, Shorten(c.Title ?? $"Publication {index}"));
        }

        if (e.ContainsKey("label") && e.ContainsKey("details"))
        {
            c.Label = Str(e, "label");
            c.Details = Str(e, "details");
            return F(EntryType.OneLine, c.Label ?? $"Line {index}");
        }

        if (Str(e, "bullet") is { } bullet)
        {
            c.Text = bullet;
            return F(EntryType.Bullet, Shorten(bullet));
        }

        if (Str(e, "number") is { } number)
        {
            c.Text = number;
            return F(EntryType.Numbered, Shorten(number));
        }

        if (Str(e, "reversed_number") is { } rev)
        {
            c.Text = rev;
            return F(EntryType.ReversedNumbered, Shorten(rev));
        }

        if (Str(e, "name") is { } name)
        {
            c.Name = name;
            return F(EntryType.Normal, Shorten(name));
        }

        return null;
    }

    private static Dictionary<string, object?>? Map(Dictionary<string, object?> d, string key) =>
        d.GetValueOrDefault(key) as Dictionary<string, object?>;

    private static string? Str(Dictionary<string, object?> d, string key) =>
        d.GetValueOrDefault(key) switch
        {
            null => null,
            string s when string.IsNullOrWhiteSpace(s) => null,
            List<object?> => null,
            Dictionary<string, object?> => null,
            var v => v.ToString(),
        };

    private static string? FirstStr(Dictionary<string, object?> d, string key) =>
        d.GetValueOrDefault(key) is List<object?> list ? list.FirstOrDefault()?.ToString() : Str(d, key);

    private static string Humanize(string key)
    {
        var words = key.Replace('_', ' ').Trim();
        return words.Length == 0 ? "Section" : char.ToUpperInvariant(words[0]) + words[1..];
    }

    private static string Shorten(string s)
    {
        var plain = System.Text.RegularExpressions.Regex.Replace(s, @"\[([^\]]+)\]\([^)]+\)", "$1").Replace("**", "").Replace("*", "").Trim();
        return plain.Length <= 60 ? plain : plain[..57] + "...";
    }
}
