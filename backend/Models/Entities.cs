namespace ResumeBuilder.Api.Models;

/// <summary>The kinds of entries rendercv understands. Every entry in a section must share one type.</summary>
public enum EntryType
{
    Text,
    Experience,
    Education,
    Normal,
    Publication,
    OneLine,
    Bullet,
    Numbered,
    ReversedNumbered,
}

public enum JobStatus
{
    Saved,
    Applied,
    Interviewing,
    Offer,
    Accepted,
    Rejected,
    Withdrawn,
    Ghosted,
}

public class Highlight
{
    public string Id { get; set; } = Ids.New();
    public string Text { get; set; } = "";
}

/// <summary>Union of every field any rendercv entry type can use. Only the fields relevant to the fragment's type are emitted.</summary>
public class FragmentContent
{
    // Text, Bullet, Numbered, ReversedNumbered
    public string? Text { get; set; }

    // Experience
    public string? Company { get; set; }
    public string? Position { get; set; }

    // Education
    public string? Institution { get; set; }
    public string? Area { get; set; }
    public string? Degree { get; set; }

    // Normal
    public string? Name { get; set; }

    // Publication
    public string? Title { get; set; }
    public List<string> Authors { get; set; } = [];
    public string? Doi { get; set; }
    public string? Url { get; set; }
    public string? Journal { get; set; }

    // OneLine
    public string? Label { get; set; }
    public string? Details { get; set; }

    // Shared by the dated entry types
    public string? Date { get; set; }
    public string? StartDate { get; set; }
    public string? EndDate { get; set; }
    public string? Location { get; set; }
    public string? Summary { get; set; }
    public List<Highlight> Highlights { get; set; } = [];
}

public class Fragment
{
    public int Id { get; set; }
    /// <summary>Short internal name shown in the library, e.g. "Acme – backend focus".</summary>
    public string Title { get; set; } = "";
    /// <summary>Default section heading the fragment lands in, e.g. "Experience".</summary>
    public string Section { get; set; } = "Experience";
    public EntryType Type { get; set; } = EntryType.Experience;
    public FragmentContent Content { get; set; } = new();
    public List<string> Tags { get; set; } = [];
    public string? Notes { get; set; }
    public bool Archived { get; set; }
    public bool Pinned { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public class SocialLink
{
    public string Network { get; set; } = "LinkedIn";
    public string Username { get; set; } = "";
}

public class CustomConnection
{
    public string Placeholder { get; set; } = "";
    public string? Url { get; set; }
    public string FontawesomeIcon { get; set; } = "link";
}

public class Profile
{
    public int Id { get; set; } = 1;
    public string Name { get; set; } = "Your Name";
    public string? Headline { get; set; }
    public string? Location { get; set; }
    public string? Email { get; set; }
    public string? Phone { get; set; }
    public string? Website { get; set; }
    public string? PhotoFile { get; set; }
    public List<SocialLink> SocialNetworks { get; set; } = [];
    public List<CustomConnection> CustomConnections { get; set; } = [];
    public DesignSettings DefaultDesign { get; set; } = new();
    public int DefaultTargetPages { get; set; } = 1;
}

public class StatusChange
{
    public JobStatus Status { get; set; }
    public DateTime At { get; set; } = DateTime.UtcNow;
    public string? Note { get; set; }
}

public class Job
{
    public int Id { get; set; }
    public string Company { get; set; } = "";
    public string Title { get; set; } = "";
    public string? Url { get; set; }
    public string? Location { get; set; }
    public string? Salary { get; set; }
    public string? Contact { get; set; }
    public string? Description { get; set; }
    public string? Notes { get; set; }
    public JobStatus Status { get; set; } = JobStatus.Saved;
    public List<StatusChange> History { get; set; } = [];
    public DateTime? AppliedAt { get; set; }
    public DateTime? Deadline { get; set; }
    /// <summary>The generated version that was actually sent with the application.</summary>
    public int? SubmittedVersionId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public class ResumeItem
{
    public string Id { get; set; } = Ids.New();
    public int FragmentId { get; set; }
    /// <summary>Highlight ids to include, in order. Null means "all highlights, library order".</summary>
    public List<string>? HighlightIds { get; set; }
    /// <summary>Resume-only replacement for the fragment's content. The library fragment stays untouched.</summary>
    public FragmentContent? Override { get; set; }
}

public class ResumeSection
{
    public string Id { get; set; } = Ids.New();
    public string Title { get; set; } = "";
    public List<ResumeItem> Items { get; set; } = [];
}

public class DesignSettings
{
    public string Theme { get; set; } = "classic";
    public string PageSize { get; set; } = "us-letter";
    /// <summary>Hex accent colour, e.g. #004f90. Null keeps the theme default.</summary>
    public string? PrimaryColor { get; set; }
    public string? FontFamily { get; set; }
    /// <summary>Body font size, e.g. "10pt".</summary>
    public string? FontSize { get; set; }
    /// <summary>All four page margins, e.g. "0.6in".</summary>
    public string? Margin { get; set; }
    public string? LineSpacing { get; set; }
    public string? Alignment { get; set; }
    public bool? ShowFooter { get; set; }
    public bool? ShowTopNote { get; set; }
    public bool ShowPhoto { get; set; }
    public string Locale { get; set; } = "english";
    public List<string> BoldKeywords { get; set; } = [];
    /// <summary>Raw YAML deep-merged into the "design" block, for anything the form doesn't cover.</summary>
    public string? CustomDesignYaml { get; set; }
}

public class Resume
{
    public int Id { get; set; }
    public string Name { get; set; } = "Untitled resume";
    public int? JobId { get; set; }
    public Job? Job { get; set; }
    public string? HeadlineOverride { get; set; }
    public List<ResumeSection> Sections { get; set; } = [];
    public DesignSettings Design { get; set; } = new();
    public int TargetPages { get; set; } = 1;
    public string? Notes { get; set; }
    public int? ClonedFromId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>An immutable, generated PDF. Its YAML is frozen so later fragment edits never change it.</summary>
public class ResumeVersion
{
    public int Id { get; set; }
    public int ResumeId { get; set; }
    public Resume? Resume { get; set; }
    public int? JobId { get; set; }
    public Job? Job { get; set; }
    public int Number { get; set; }
    public string ResumeName { get; set; } = "";
    public string? Label { get; set; }
    public string? Notes { get; set; }
    public string Yaml { get; set; } = "";
    public int PageCount { get; set; }
    public string Folder { get; set; } = "";
    public string? Theme { get; set; }
    /// <summary>JSON of the resume layout at generation time, so the version can be restored or branched.</summary>
    public string? Snapshot { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public static class Ids
{
    public static string New() => Guid.NewGuid().ToString("N")[..10];
}
