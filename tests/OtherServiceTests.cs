using System.IO.Compression;
using ResumeBuilder.Api.Models;
using ResumeBuilder.Api.Services;

namespace ResumeBuilder.Tests;

public class PngInspectorTests
{
    /// <summary>Encodes an RGBA image whose only dark rows are the given range.</summary>
    private static byte[] Png(int w, int h, int inkFrom, int inkTo)
    {
        using var raw = new MemoryStream();
        for (var y = 0; y < h; y++)
        {
            raw.WriteByte((byte)(y % 5)); // cycle through every filter type
            var row = new byte[w * 4];
            for (var x = 0; x < w; x++)
            {
                var ink = y >= inkFrom && y <= inkTo && x is > 3 and < 20;
                row[x * 4] = row[x * 4 + 1] = row[x * 4 + 2] = (byte)(ink ? 0 : 255);
                row[x * 4 + 3] = 255;
            }

            // Write filtered bytes such that unfiltering reproduces "row". Filter 0 for simplicity on odd rows.
            raw.Write(Filter(y % 5, row, y == 0 ? new byte[row.Length] : Last!, 4));
            Last = row;
        }

        using var z = new MemoryStream();
        using (var zs = new ZLibStream(z, CompressionLevel.Fastest, true)) zs.Write(raw.ToArray());
        using var png = new MemoryStream();
        png.Write([137, 80, 78, 71, 13, 10, 26, 10]);
        Chunk(png, "IHDR", [.. Be(w), .. Be(h), 8, 6, 0, 0, 0]);
        Chunk(png, "IDAT", z.ToArray());
        Chunk(png, "IEND", []);
        return png.ToArray();
    }

    [ThreadStatic] private static byte[]? Last;

    private static byte[] Filter(int f, byte[] cur, byte[] prev, int bpp)
    {
        var o = new byte[cur.Length];
        for (var i = 0; i < cur.Length; i++)
        {
            int a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
            int p = a + b - c, pa = Math.Abs(p - a), pb = Math.Abs(p - b), pc = Math.Abs(p - c);
            var paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
            o[i] = f switch { 1 => (byte)(cur[i] - a), 2 => (byte)(cur[i] - b), 3 => (byte)(cur[i] - ((a + b) >> 1)), 4 => (byte)(cur[i] - paeth), _ => cur[i] };
        }

        return o;
    }

    private static byte[] Be(int v) => [(byte)(v >> 24), (byte)(v >> 16), (byte)(v >> 8), (byte)v];

    private static void Chunk(Stream s, string type, byte[] data)
    {
        s.Write(Be(data.Length));
        var t = System.Text.Encoding.ASCII.GetBytes(type);
        s.Write(t);
        s.Write(data);
        s.Write(Be((int)System.IO.Hashing.Crc32.HashToUInt32([.. t, .. data])));
    }

    [Fact]
    public void Finds_first_and_last_ink_rows_across_all_filters()
    {
        var ink = PngInspector.Inspect(Png(32, 60, 7, 41));
        Assert.NotNull(ink);
        Assert.Equal(7, ink!.FirstInkRow);
        Assert.Equal(41, ink.LastInkRow);
    }

    [Fact]
    public void Rejects_non_png() => Assert.Null(PngInspector.Inspect("not a png"u8.ToArray()));
}

public class KeywordAnalyzerTests
{
    private const string Posting = "Contoso is hiring a backend engineer. You will build services in C# and .NET on Kubernetes. " +
                                   "Experience with distributed systems and distributed systems design. Contoso values CI/CD.";

    [Fact]
    public void Keeps_technical_tokens_and_repeated_phrases_and_ignores_company()
    {
        var terms = KeywordAnalyzer.Extract(Posting, ignore: "Contoso").Select(k => k.Term).ToList();
        Assert.Contains("c#", terms);
        Assert.Contains(".net", terms);
        Assert.Contains("kubernetes", terms);
        Assert.Contains("distributed systems", terms);
        Assert.DoesNotContain("contoso", terms);
        Assert.DoesNotContain("hiring", terms);
        Assert.DoesNotContain("the", terms);
    }

    [Fact]
    public void Ranks_fragments_by_weighted_overlap()
    {
        var keywords = KeywordAnalyzer.Extract(Posting, ignore: "Contoso");
        var good = new Fragment { Id = 1, Content = new FragmentContent { Company = "X", Highlights = [new() { Text = "Built C# services on Kubernetes" }] } };
        var bad = new Fragment { Id = 2, Content = new FragmentContent { Company = "Y", Highlights = [new() { Text = "Painted fences" }] } };
        var ranking = KeywordAnalyzer.Rank([bad, good], keywords);
        Assert.Equal(1, ranking[0].FragmentId);
        Assert.Contains("kubernetes", ranking[0].Matched);
        Assert.Equal(0, ranking[1].Score);
    }

    [Fact]
    public void Matches_whole_words_only()
    {
        Assert.True(KeywordAnalyzer.Contains("we use go and rust", "go"));
        Assert.False(KeywordAnalyzer.Contains("we use google", "go"));
        Assert.True(KeywordAnalyzer.Contains("built apis", "api"));
    }
}

public class YamlImporterTests
{
    [Fact]
    public void Splits_a_rendercv_file_into_profile_and_typed_fragments()
    {
        const string yaml = """
            cv:
              name: Jane Roe
              email: jane@example.com
              social_networks:
                - network: GitHub
                  username: jroe
              sections:
                summary:
                  - Builds reliable systems.
                experience:
                  - company: Acme
                    position: Engineer
                    start_date: 2020-01
                    end_date: present
                    highlights:
                      - Did things
                projects:
                  - name: '[Tool](https://x.dev)'
                    date: 2021
                skills:
                  - label: Languages
                    details: C#, Go
            design:
              theme: sb2nov
            """;
        var r = YamlImporter.Parse(yaml);
        Assert.Equal("Jane Roe", r.Profile!.Name);
        Assert.Equal("jroe", r.Profile.SocialNetworks.Single().Username);
        Assert.Equal("sb2nov", r.Theme);
        var all = r.Sections.SelectMany(s => s.Fragments).ToList();
        Assert.Equal([EntryType.Text, EntryType.Experience, EntryType.Normal, EntryType.OneLine], all.Select(f => f.Type));
        Assert.Equal("Tool", all[2].Title);
        Assert.Equal("2021", all[2].Content.Date);
        Assert.Equal("Did things", all[1].Content.Highlights.Single().Text);
    }

    [Fact]
    public void Round_trips_through_the_builder()
    {
        var (profile, resume, fragments) = CvYamlBuilderTests.Everything();
        var yaml = CvYamlBuilder.Build(profile, resume, fragments, new BuildOptions()).Yaml;
        var parsed = YamlImporter.Parse(yaml);
        Assert.Equal(fragments.Values.Select(f => f.Type), parsed.Sections.SelectMany(s => s.Fragments).Select(f => f.Type));
    }
}

public class BestMatchTests
{
    [Fact]
    public void Picks_relevant_fragments_one_type_per_section_newest_first_summary_on_top()
    {
        Fragment F(int id, EntryType t, string section, FragmentContent c, bool pinned = false) =>
            new() { Id = id, Type = t, Section = section, Title = $"f{id}", Content = c, Pinned = pinned };
        var library = new List<Fragment>
        {
            F(1, EntryType.Experience, "Experience", new() { Company = "Old", StartDate = "2015-01", EndDate = "2017-01", Highlights = [new() { Text = "Kubernetes clusters" }] }),
            F(2, EntryType.Experience, "Experience", new() { Company = "New", StartDate = "2020-01", EndDate = "present", Highlights = [new() { Text = "Kubernetes and Terraform" }] }),
            F(3, EntryType.Experience, "Experience", new() { Company = "Bakery", Highlights = [new() { Text = "Baked bread" }] }),
            F(4, EntryType.Text, "Summary", new() { Text = "Platform engineer: Kubernetes, Terraform" }),
            F(5, EntryType.Text, "Summary", new() { Text = "Pastry chef" }),
            F(6, EntryType.OneLine, "Skills", new() { Label = "Tools", Details = "Terraform" }),
            F(7, EntryType.Bullet, "Skills", new() { Text = "Terraform bullet" }),
            F(8, EntryType.Education, "Education", new() { Institution = "Uni", Area = "CS" }, pinned: true),
        };
        var job = new Job { Company = "Contoso", Description = "Contoso needs Kubernetes and Terraform skills. Kubernetes, Terraform." };

        var sections = ResumeBuilder.Api.Endpoints.ResumeEndpoints.BestMatchSections(library, job);

        Assert.Equal("Summary", sections[0].Title);
        Assert.Equal([4], sections[0].Items.Select(i => i.FragmentId));
        var exp = sections.Single(s => s.Title == "Experience");
        Assert.Equal([2, 1], exp.Items.Select(i => i.FragmentId));
        Assert.Single(sections.Single(s => s.Title == "Skills").Items);
        Assert.Contains(sections, s => s.Title == "Education"); // pinned, despite no match
    }
}

public class PerformanceTests
{
    private static Job J(JobStatus now, params JobStatus[] history) =>
        new() { Status = now, History = history.Select(s => new StatusChange { Status = s }).ToList(), AppliedAt = DateTime.UtcNow.AddDays(-3) };

    [Fact]
    public void Outcome_uses_the_furthest_stage_reached()
    {
        var now = DateTime.UtcNow;
        Assert.Equal(Outcome.Interview, PerformanceService.OutcomeOf(J(JobStatus.Rejected, JobStatus.Applied, JobStatus.Interviewing), now, now));
        Assert.Equal(Outcome.Offer, PerformanceService.OutcomeOf(J(JobStatus.Withdrawn, JobStatus.Offer), now, now));
        Assert.Equal(Outcome.Rejected, PerformanceService.OutcomeOf(J(JobStatus.Rejected, JobStatus.Applied), now, now));
        Assert.Equal(Outcome.Pending, PerformanceService.OutcomeOf(J(JobStatus.Applied), now, now));
        var stale = J(JobStatus.Applied);
        stale.AppliedAt = now.AddDays(-45);
        Assert.Equal(Outcome.NoResponse, PerformanceService.OutcomeOf(stale, now, now));
    }

    [Fact]
    public void Grades_on_interview_rate_of_resolved_applications_only()
    {
        var t = new Tally(Sent: 6, Pending: 2, NoResponse: 2, Rejected: 1, Interviews: 1, Offers: 0);
        Assert.Equal(4, t.Resolved);
        Assert.Equal(0.25, t.InterviewRate);
        Assert.Equal("B", t.Grade);
        Assert.False(t.LowConfidence);
        Assert.Null(new Tally(2, 2, 0, 0, 0, 0).Grade);
    }
}
