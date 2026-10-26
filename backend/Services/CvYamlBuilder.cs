using System.Globalization;
using System.Text.RegularExpressions;
using ResumeBuilder.Api.Models;
using YamlDotNet.Serialization;

namespace ResumeBuilder.Api.Services;

public record BuildResult(string Yaml, List<string> Warnings, string? PhotoPath);

public record BuildOptions(bool ForPreview = false, string? PhotoAbsolutePath = null, string? PdfTitle = null);

/// <summary>Turns a profile + resume layout + fragment library into a rendercv input document.</summary>
public static partial class CvYamlBuilder
{
    public static readonly string[] Themes =
        ["classic", "engineeringresumes", "engineeringclassic", "sb2nov", "moderncv", "harvard", "ember", "ink", "opal"];

    public static readonly string[] PageSizes = ["us-letter", "a4", "a5", "us-executive"];

    public static readonly string[] Fonts =
    [
        "Source Sans 3", "EB Garamond", "Fontin", "Gentium Book Plus", "Lato", "Libertinus Serif", "Mukta",
        "New Computer Modern", "Noto Sans", "Open Sans", "Open Sauce Sans", "Poppins", "Raleway", "Roboto",
        "Ubuntu", "XCharter", "DejaVu Sans Mono",
    ];

    public static readonly string[] Locales =
    [
        "english", "arabic", "danish", "dutch", "french", "german", "hebrew", "hindi", "hungarian", "indonesian",
        "italian", "japanese", "korean", "mandarin_chinese", "norwegian_bokmål", "norwegian_nynorsk", "persian",
        "portuguese", "russian", "spanish", "turkish", "vietnamese",
    ];

    public static readonly string[] SocialNetworks =
    [
        "LinkedIn", "GitHub", "GitLab", "IMDB", "Instagram", "ORCID", "Mastodon", "StackOverflow", "ResearchGate",
        "YouTube", "Google Scholar", "Telegram", "WhatsApp", "Leetcode", "X", "Bluesky", "Reddit",
    ];

    /// <summary>Default page margin of each built-in theme, used when estimating how full a page is.</summary>
    public static string DefaultMargin(string theme) => theme switch
    {
        "harvard" => "0.5in",
        "ember" or "ink" => "0.6in",
        "opal" => "0.65in",
        _ => "0.7in",
    };

    /// <summary>Page height in inches.</summary>
    public static double PageHeightInches(string size) => size switch
    {
        "a4" => 297 / 25.4,
        "a5" => 210 / 25.4,
        "us-executive" => 10.5,
        _ => 11,
    };

    /// <summary>Parses a Typst length such as "0.7in", "2cm", "15mm" or "36pt" into inches.</summary>
    public static double? ToInches(string? dimension)
    {
        if (string.IsNullOrWhiteSpace(dimension)) return null;
        var m = DimensionRegex().Match(dimension.Trim());
        if (!m.Success) return null;
        var value = double.Parse(m.Groups[1].Value, CultureInfo.InvariantCulture);
        return m.Groups[2].Value switch
        {
            "in" => value,
            "cm" => value / 2.54,
            "mm" => value / 25.4,
            "pt" => value / 72,
            _ => null,
        };
    }

    [GeneratedRegex(@"^([0-9]*\.?[0-9]+)\s*(in|cm|mm|pt)$")]
    private static partial Regex DimensionRegex();

    /// <summary>Content of an item after applying its resume-only override and highlight selection.</summary>
    public static FragmentContent ResolveContent(ResumeItem item, Fragment fragment)
    {
        var source = item.Override ?? fragment.Content;
        var highlights = source.Highlights;
        if (item.HighlightIds is not null)
        {
            var byId = highlights.ToDictionary(h => h.Id);
            highlights = item.HighlightIds.Where(byId.ContainsKey).Select(id => byId[id]).ToList();
        }

        return new FragmentContent
        {
            Text = source.Text, Company = source.Company, Position = source.Position,
            Institution = source.Institution, Area = source.Area, Degree = source.Degree, Name = source.Name,
            Title = source.Title, Authors = source.Authors, Doi = source.Doi, Url = source.Url, Journal = source.Journal,
            Label = source.Label, Details = source.Details, Date = source.Date, StartDate = source.StartDate,
            EndDate = source.EndDate, Location = source.Location, Summary = source.Summary, Highlights = highlights,
        };
    }

    public static BuildResult Build(Profile profile, Resume resume, IReadOnlyDictionary<int, Fragment> fragments, BuildOptions options)
    {
        var warnings = new List<string>();
        var cv = new Dictionary<string, object?>();
        Put(cv, "name", profile.Name);
        Put(cv, "headline", string.IsNullOrWhiteSpace(resume.HeadlineOverride) ? profile.Headline : resume.HeadlineOverride);
        Put(cv, "location", profile.Location);
        Put(cv, "email", profile.Email);
        Put(cv, "phone", profile.Phone);
        Put(cv, "website", profile.Website);

        string? photo = null;
        if (resume.Design.ShowPhoto && options.PhotoAbsolutePath is not null && File.Exists(options.PhotoAbsolutePath))
        {
            photo = options.PhotoAbsolutePath;
            cv["photo"] = "photo" + Path.GetExtension(photo);
        }

        var socials = profile.SocialNetworks
            .Where(s => !string.IsNullOrWhiteSpace(s.Username))
            .Select(s => new Dictionary<string, object?> { ["network"] = s.Network, ["username"] = s.Username.Trim() })
            .ToList();
        if (socials.Count > 0) cv["social_networks"] = socials;

        var custom = profile.CustomConnections
            .Where(c => !string.IsNullOrWhiteSpace(c.Placeholder))
            .Select(c =>
            {
                var d = new Dictionary<string, object?> { ["placeholder"] = c.Placeholder, ["fontawesome_icon"] = c.FontawesomeIcon };
                d["url"] = string.IsNullOrWhiteSpace(c.Url) ? null : c.Url;
                return d;
            })
            .ToList();
        if (custom.Count > 0) cv["custom_connections"] = custom;

        var sections = new Dictionary<string, object?>();
        foreach (var section in resume.Sections)
        {
            var title = string.IsNullOrWhiteSpace(section.Title) ? "Section" : section.Title.Trim();
            if (sections.ContainsKey(title))
            {
                warnings.Add($"Section \"{title}\" appears twice; the second copy was skipped. Rename one of them.");
                continue;
            }

            EntryType? sectionType = null;
            var entries = new List<object>();
            foreach (var item in section.Items)
            {
                if (!fragments.TryGetValue(item.FragmentId, out var fragment))
                {
                    warnings.Add($"A fragment in \"{title}\" no longer exists and was skipped.");
                    continue;
                }

                sectionType ??= fragment.Type;
                if (fragment.Type != sectionType)
                {
                    warnings.Add($"\"{fragment.Title}\" ({fragment.Type}) doesn't match the {sectionType} entries in \"{title}\". " +
                                 "rendercv needs one entry type per section, so it was skipped.");
                    continue;
                }

                var content = ResolveContent(item, fragment);
                object? entry = fragment.Type == EntryType.Text ? BuildTextEntry(content) : BuildEntry(fragment.Type, content);
                if (entry is not null) entries.Add(entry);
            }

            if (entries.Count > 0) sections[title] = entries;
        }

        if (sections.Count > 0) cv["sections"] = sections;
        else warnings.Add("The resume has no content yet. Add fragments to a section.");

        var doc = new Dictionary<string, object?>
        {
            ["cv"] = cv,
            ["design"] = BuildDesign(resume.Design, options.ForPreview, warnings),
            ["locale"] = new Dictionary<string, object?> { ["language"] = resume.Design.Locale },
        };

        var settings = new Dictionary<string, object?> { ["current_date"] = "today" };
        var bold = resume.Design.BoldKeywords.Where(k => !string.IsNullOrWhiteSpace(k)).Select(k => k.Trim()).Distinct().ToList();
        if (bold.Count > 0) settings["bold_keywords"] = bold;
        settings["pdf_title"] = options.PdfTitle ?? $"{profile.Name} - Resume";
        doc["settings"] = settings;

        return new BuildResult(Serialize(doc), warnings, photo);
    }

    private static Dictionary<string, object?> BuildDesign(DesignSettings d, bool forPreview, List<string> warnings)
    {
        var design = new Dictionary<string, object?> { ["theme"] = Themes.Contains(d.Theme) ? d.Theme : "classic" };

        var page = new Dictionary<string, object?> { ["size"] = PageSizes.Contains(d.PageSize) ? d.PageSize : "us-letter" };
        if (ToInches(d.Margin) is not null)
        {
            foreach (var side in new[] { "top", "bottom", "left", "right" }) page[$"{side}_margin"] = d.Margin!.Trim();
        }
        else if (!string.IsNullOrWhiteSpace(d.Margin))
        {
            warnings.Add($"Margin \"{d.Margin}\" isn't a valid length (try 0.6in or 1.5cm); the theme default was used.");
        }

        // The footer lives in the bottom margin, so hiding it for previews keeps pagination identical
        // while letting the page-fill estimate see only real content.
        if (forPreview) page["show_footer"] = false;
        else if (d.ShowFooter is not null) page["show_footer"] = d.ShowFooter;
        if (d.ShowTopNote is not null) page["show_top_note"] = d.ShowTopNote;
        design["page"] = page;

        if (TryParseHex(d.PrimaryColor) is { } rgb)
        {
            design["colors"] = new[] { "name", "headline", "connections", "section_titles", "links" }
                .ToDictionary(k => k, object? (_) => rgb);
        }

        var typography = new Dictionary<string, object?>();
        if (!string.IsNullOrWhiteSpace(d.FontFamily))
        {
            typography["font_family"] = new[] { "body", "name", "headline", "connections", "section_titles" }
                .ToDictionary(k => k, object? (_) => d.FontFamily);
        }
        if (!string.IsNullOrWhiteSpace(d.FontSize)) typography["font_size"] = new Dictionary<string, object?> { ["body"] = d.FontSize.Trim() };
        if (!string.IsNullOrWhiteSpace(d.LineSpacing)) typography["line_spacing"] = d.LineSpacing.Trim();
        if (!string.IsNullOrWhiteSpace(d.Alignment)) typography["alignment"] = d.Alignment;
        if (typography.Count > 0) design["typography"] = typography;

        if (!string.IsNullOrWhiteSpace(d.CustomDesignYaml))
        {
            try
            {
                var custom = new DeserializerBuilder().Build().Deserialize<object>(d.CustomDesignYaml);
                if (Normalize(custom) is Dictionary<string, object?> overrides) DeepMerge(design, overrides);
                else warnings.Add("Custom design YAML must be a mapping (key: value pairs); it was ignored.");
            }
            catch (Exception ex)
            {
                warnings.Add($"Custom design YAML could not be parsed and was ignored: {ex.Message}");
            }

            if (forPreview && design.TryGetValue("page", out var p) && p is Dictionary<string, object?> pd) pd["show_footer"] = false;
        }

        return design;
    }

    private static Dictionary<string, object?>? BuildEntry(EntryType type, FragmentContent c)
    {
        var e = new Dictionary<string, object?>();
        switch (type)
        {
            case EntryType.Text:
                return null; // handled by caller: text sections are plain strings
            case EntryType.Bullet:
                return string.IsNullOrWhiteSpace(c.Text) ? null : new() { ["bullet"] = c.Text.Trim() };
            case EntryType.Numbered:
                return string.IsNullOrWhiteSpace(c.Text) ? null : new() { ["number"] = c.Text.Trim() };
            case EntryType.ReversedNumbered:
                return string.IsNullOrWhiteSpace(c.Text) ? null : new() { ["reversed_number"] = c.Text.Trim() };
            case EntryType.OneLine:
                return new() { ["label"] = c.Label ?? "", ["details"] = c.Details ?? "" };
            case EntryType.Experience:
                e["company"] = c.Company ?? "";
                Put(e, "position", c.Position);
                break;
            case EntryType.Education:
                e["institution"] = c.Institution ?? "";
                e["area"] = c.Area ?? "";
                Put(e, "degree", c.Degree);
                break;
            case EntryType.Normal:
                e["name"] = c.Name ?? "";
                break;
            case EntryType.Publication:
                e["title"] = c.Title ?? "";
                e["authors"] = c.Authors.Where(a => !string.IsNullOrWhiteSpace(a)).ToList();
                Put(e, "doi", c.Doi);
                Put(e, "url", c.Url);
                Put(e, "journal", c.Journal);
                Put(e, "date", c.Date);
                Put(e, "summary", c.Summary);
                return e;
        }

        if (!string.IsNullOrWhiteSpace(c.StartDate))
        {
            e["start_date"] = c.StartDate.Trim();
            Put(e, "end_date", c.EndDate);
        }
        else Put(e, "date", c.Date);

        Put(e, "location", c.Location);
        Put(e, "summary", c.Summary);
        var highlights = c.Highlights.Select(h => h.Text.TrimEnd()).Where(t => !string.IsNullOrWhiteSpace(t)).ToList();
        if (highlights.Count > 0) e["highlights"] = highlights;
        return e;
    }

    /// <summary>Text sections hold bare strings instead of mappings.</summary>
    private static object? BuildTextEntry(FragmentContent c) => string.IsNullOrWhiteSpace(c.Text) ? null : c.Text.Trim();

    private static void Put(Dictionary<string, object?> d, string key, string? value)
    {
        if (!string.IsNullOrWhiteSpace(value)) d[key] = value.Trim();
    }

    private static string? TryParseHex(string? hex)
    {
        if (string.IsNullOrWhiteSpace(hex)) return null;
        var h = hex.Trim().TrimStart('#');
        if (h.Length == 3) h = string.Concat(h.Select(ch => $"{ch}{ch}"));
        if (h.Length != 6 || !int.TryParse(h, NumberStyles.HexNumber, null, out var v)) return null;
        return $"rgb({(v >> 16) & 255}, {(v >> 8) & 255}, {v & 255})";
    }

    internal static object? Normalize(object? node) => node switch
    {
        IDictionary<object, object?> map => map.ToDictionary(kv => kv.Key.ToString()!, kv => Normalize(kv.Value)),
        IList<object?> list => list.Select(Normalize).ToList(),
        _ => node,
    };

    private static void DeepMerge(Dictionary<string, object?> target, Dictionary<string, object?> source)
    {
        foreach (var (key, value) in source)
        {
            if (value is Dictionary<string, object?> sv && target.TryGetValue(key, out var tv) && tv is Dictionary<string, object?> tdict)
                DeepMerge(tdict, sv);
            else
                target[key] = value;
        }
    }

    public static string Serialize(object doc) =>
        new SerializerBuilder()
            .WithQuotingNecessaryStrings()
            .DisableAliases()
            .WithIndentedSequences()
            .Build()
            .Serialize(doc);
}
