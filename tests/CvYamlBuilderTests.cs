using System.Diagnostics;
using ResumeBuilder.Api.Models;
using ResumeBuilder.Api.Services;

namespace ResumeBuilder.Tests;

public class CvYamlBuilderTests
{
    private static Fragment F(int id, EntryType type, string section, FragmentContent c) =>
        new() { Id = id, Type = type, Section = section, Title = $"f{id}", Content = c };

    /// <summary>One fragment of every entry type, each in its own section.</summary>
    internal static (Profile, Resume, Dictionary<int, Fragment>) Everything()
    {
        var hl = new List<Highlight> { new() { Id = "h1", Text = "Cut p99 latency **40%**" }, new() { Id = "h2", Text = "Led 4 engineers" } };
        var fragments = new[]
        {
            F(1, EntryType.Text, "Summary", new() { Text = "Engineer who ships. Yes: true" }),
            F(2, EntryType.Experience, "Experience", new() { Company = "Acme", Position = "SWE", StartDate = "2021-06", EndDate = "present", Location = "Remote", Highlights = hl }),
            F(3, EntryType.Education, "Education", new() { Institution = "MIT", Area = "CS", Degree = "BS", Date = "2019" }),
            F(4, EntryType.Normal, "Projects", new() { Name = "[Tool](https://example.com)", Summary = "CLI", Highlights = [new() { Text = "Used by 300 teams" }] }),
            F(5, EntryType.Publication, "Publications", new() { Title = "Paper", Authors = ["*Me*", "You"], Journal = "ICML", Date = "2022-07", Doi = "10.1/x" }),
            F(6, EntryType.OneLine, "Skills", new() { Label = "Languages", Details = "C#, TypeScript: yes" }),
            F(7, EntryType.Bullet, "Awards", new() { Text = "Hackathon winner" }),
            F(8, EntryType.Numbered, "Patents", new() { Text = "Patent 123" }),
            F(9, EntryType.ReversedNumbered, "Talks", new() { Text = "Talk at Conf" }),
        }.ToDictionary(f => f.Id);

        var resume = new Resume
        {
            Sections = fragments.Values.Select(f => new ResumeSection
            {
                Title = f.Section,
                Items = [new ResumeItem { FragmentId = f.Id }],
            }).ToList(),
        };
        var profile = new Profile
        {
            Name = "Test Person", Email = "t@example.com", Phone = "+1 415 555 0100", Website = "https://example.com",
            SocialNetworks = [new() { Network = "GitHub", Username = "tester" }],
        };
        return (profile, resume, fragments);
    }

    [Fact]
    public void Builds_every_entry_type_without_warnings()
    {
        var (profile, resume, fragments) = Everything();
        var result = CvYamlBuilder.Build(profile, resume, fragments, new BuildOptions());
        Assert.Empty(result.Warnings);
        Assert.Contains("company: Acme", result.Yaml);
        Assert.Contains("reversed_number: Talk at Conf", result.Yaml);
        Assert.Contains("end_date: present", result.Yaml);
    }

    [Fact]
    public void Highlight_selection_and_override_are_applied()
    {
        var (profile, resume, fragments) = Everything();
        var item = resume.Sections.Single(s => s.Title == "Experience").Items[0];
        item.HighlightIds = ["h2"];
        var yaml = CvYamlBuilder.Build(profile, resume, fragments, new BuildOptions()).Yaml;
        Assert.Contains("Led 4 engineers", yaml);
        Assert.DoesNotContain("p99", yaml);

        item.Override = new FragmentContent { Company = "Tailored Co", Highlights = [] };
        item.HighlightIds = null;
        yaml = CvYamlBuilder.Build(profile, resume, fragments, new BuildOptions()).Yaml;
        Assert.Contains("Tailored Co", yaml);
        Assert.Equal("Acme", fragments[2].Content.Company);
    }

    [Fact]
    public void Mixed_types_in_one_section_are_skipped_with_a_warning()
    {
        var (profile, resume, fragments) = Everything();
        resume.Sections[0].Items.Add(new ResumeItem { FragmentId = 2 });
        var result = CvYamlBuilder.Build(profile, resume, fragments, new BuildOptions());
        Assert.Single(result.Warnings);
    }

    [Fact]
    public void Preview_hides_footer_even_when_custom_yaml_sets_it()
    {
        var (profile, resume, fragments) = Everything();
        resume.Design.CustomDesignYaml = "page:\n  show_footer: true\n";
        var yaml = CvYamlBuilder.Build(profile, resume, fragments, new BuildOptions(ForPreview: true)).Yaml;
        Assert.Contains("show_footer: false", yaml);
    }

    [Theory]
    [InlineData("0.7in", 0.7)]
    [InlineData("2.54cm", 1.0)]
    [InlineData("72pt", 1.0)]
    [InlineData("nonsense", null)]
    public void Parses_typst_lengths(string input, double? inches)
    {
        var v = CvYamlBuilder.ToInches(input);
        if (inches is null) Assert.Null(v);
        else Assert.Equal(inches.Value, v!.Value, 3);
    }

    /// <summary>Renders the all-types document with every theme through the real rendercv, when it is installed.</summary>
    [Fact]
    public async Task Real_rendercv_accepts_output_for_every_theme()
    {
        if (!OnPath("rendercv")) return;
        var (profile, resume, fragments) = Everything();
        foreach (var theme in CvYamlBuilder.Themes)
        {
            resume.Design = new DesignSettings { Theme = theme, PrimaryColor = "#123456", FontFamily = "Lato", Margin = "0.6in", BoldKeywords = ["Acme"] };
            var build = CvYamlBuilder.Build(profile, resume, fragments, new BuildOptions(ForPreview: true));
            var dir = Directory.CreateTempSubdirectory("rb-test-").FullName;
            try
            {
                await File.WriteAllTextAsync(Path.Combine(dir, "cv.yaml"), build.Yaml);
                var psi = new ProcessStartInfo("rendercv", "render cv.yaml -nomd -nohtml -nopng --pdf-path out.pdf")
                    { WorkingDirectory = dir, RedirectStandardOutput = true, RedirectStandardError = true };
                psi.Environment["NO_COLOR"] = "1";
                using var p = Process.Start(psi)!;
                var output = await p.StandardOutput.ReadToEndAsync() + await p.StandardError.ReadToEndAsync();
                await p.WaitForExitAsync();
                Assert.True(p.ExitCode == 0, $"{theme} failed:\n{output}\n{build.Yaml}");
                Assert.True(File.Exists(Path.Combine(dir, "out.pdf")), theme);
            }
            finally
            {
                Directory.Delete(dir, true);
            }
        }
    }

    private static bool OnPath(string exe) =>
        (Environment.GetEnvironmentVariable("PATH") ?? "").Split(Path.PathSeparator).Any(d => File.Exists(Path.Combine(d, exe)));
}
