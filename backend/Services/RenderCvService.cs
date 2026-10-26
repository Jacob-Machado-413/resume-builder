using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace ResumeBuilder.Api.Services;

public class AppPaths
{
    public AppPaths(IConfiguration config, IHostEnvironment env)
    {
        var configured = config["ResumeBuilder:DataDirectory"];
        DataDir = Path.GetFullPath(string.IsNullOrWhiteSpace(configured) ? Path.Combine(env.ContentRootPath, "data") : configured);
        Directory.CreateDirectory(DataDir);
        Directory.CreateDirectory(PreviewDir);
        Directory.CreateDirectory(VersionsDir);
        Directory.CreateDirectory(UploadsDir);
    }

    public string DataDir { get; }
    public string DbPath => Path.Combine(DataDir, "resume-builder.db");
    public string PreviewDir => Path.Combine(DataDir, "cache", "previews");
    public string VersionsDir => Path.Combine(DataDir, "versions");
    public string UploadsDir => Path.Combine(DataDir, "uploads");
}

/// <param name="Transient">The failure says nothing about the YAML (timeout, rendercv missing), so it must not be cached.</param>
public record RenderOutcome(bool Success, string? Error, List<string> PagePngs, string? Pdf, string? Typst, string? Markdown, bool Transient = false);

public record PagePreview(int Number, string Url, double Fill);

public record PreviewResult(string Key, int PageCount, List<PagePreview> Pages, List<string> Warnings, string? Error, string Yaml);

public partial class RenderCvService(IConfiguration config, AppPaths paths, ILogger<RenderCvService> log)
{
    private static readonly SemaphoreSlim Gate = new(3);
    private string Executable => config["ResumeBuilder:RenderCvPath"] is { Length: > 0 } p ? p : "rendercv";

    /// <summary>Runs rendercv on <paramref name="yaml"/> inside <paramref name="workDir"/>.</summary>
    public async Task<RenderOutcome> RenderAsync(string yaml, string? photoPath, string workDir, bool full, CancellationToken ct = default)
    {
        var psi = new ProcessStartInfo(Executable)
        {
            WorkingDirectory = workDir,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
        };
        psi.ArgumentList.Add("render");
        psi.ArgumentList.Add("cv.yaml");
        psi.ArgumentList.Add("--typst-path");
        psi.ArgumentList.Add("resume.typ");
        psi.ArgumentList.Add("--png-path");
        psi.ArgumentList.Add("page.png");
        psi.ArgumentList.Add("-nohtml");
        if (full)
        {
            psi.ArgumentList.Add("--pdf-path");
            psi.ArgumentList.Add("resume.pdf");
            psi.ArgumentList.Add("--markdown-path");
            psi.ArgumentList.Add("resume.md");
        }
        else
        {
            psi.ArgumentList.Add("-nopdf");
            psi.ArgumentList.Add("-nomd");
        }

        psi.Environment["NO_COLOR"] = "1";
        psi.Environment["TERM"] = "dumb";
        psi.Environment["COLUMNS"] = "120";

        // Wait for a slot before touching the disk, so a request cancelled in the queue leaves nothing behind.
        await Gate.WaitAsync(ct);
        try
        {
            Directory.CreateDirectory(workDir);
            await File.WriteAllTextAsync(Path.Combine(workDir, "cv.yaml"), yaml, ct);
            if (photoPath is not null) File.Copy(photoPath, Path.Combine(workDir, "photo" + Path.GetExtension(photoPath)), true);

            using var proc = Process.Start(psi) ?? throw new InvalidOperationException("Could not start rendercv.");
            var stdout = proc.StandardOutput.ReadToEndAsync(ct);
            var stderr = proc.StandardError.ReadToEndAsync(ct);
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(TimeSpan.FromSeconds(90));
            try
            {
                await proc.WaitForExitAsync(timeout.Token);
            }
            catch (OperationCanceledException)
            {
                proc.Kill(true);
                // The caller went away (e.g. a newer preview superseded this one); that is not a timeout.
                ct.ThrowIfCancellationRequested();
                return Fail("rendercv timed out after 90 seconds.", transient: true);
            }

            var output = Clean((await stdout) + "\n" + (await stderr));
            var pngs = Directory.GetFiles(workDir, "page_*.png")
                .OrderBy(f => int.TryParse(PageNumberRegex().Match(f).Groups[1].Value, out var n) ? n : 0)
                .ToList();
            // A single-page CV may be written without the _1 suffix.
            if (pngs.Count == 0 && File.Exists(Path.Combine(workDir, "page.png")))
            {
                File.Move(Path.Combine(workDir, "page.png"), Path.Combine(workDir, "page_1.png"));
                pngs.Add(Path.Combine(workDir, "page_1.png"));
            }

            if (proc.ExitCode != 0 || pngs.Count == 0)
            {
                log.LogWarning("rendercv failed ({Code}): {Output}", proc.ExitCode, output);
                return Fail(string.IsNullOrWhiteSpace(output) ? $"rendercv exited with code {proc.ExitCode}." : output);
            }

            string? Existing(string name) => File.Exists(Path.Combine(workDir, name)) ? Path.Combine(workDir, name) : null;
            return new RenderOutcome(true, null, pngs, Existing("resume.pdf"), Existing("resume.typ"), Existing("resume.md"));
        }
        catch (System.ComponentModel.Win32Exception)
        {
            return Fail($"Could not run \"{Executable}\". Install rendercv or set ResumeBuilder:RenderCvPath in appsettings.json.", transient: true);
        }
        finally
        {
            Gate.Release();
        }
    }

    public async Task<string?> VersionAsync()
    {
        try
        {
            var psi = new ProcessStartInfo(Executable, "--version") { RedirectStandardOutput = true, UseShellExecute = false };
            psi.Environment["NO_COLOR"] = "1";
            using var proc = Process.Start(psi)!;
            var text = await proc.StandardOutput.ReadToEndAsync();
            await proc.WaitForExitAsync();
            return text.Trim();
        }
        catch
        {
            return null;
        }
    }

    /// <summary>Renders a preview (cached by content hash) and measures how full each page is.</summary>
    public async Task<PreviewResult> PreviewAsync(BuildResult build, string theme, string pageSize, string? margin, CancellationToken ct)
    {
        var hashInput = build.Yaml + (build.PhotoPath is null ? "" : File.GetLastWriteTimeUtc(build.PhotoPath).Ticks.ToString());
        var key = Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(hashInput)))[..24];
        var dir = Path.Combine(paths.PreviewDir, key);
        var errorFile = Path.Combine(dir, "error.txt");

        if (!Directory.Exists(dir) || (!Directory.EnumerateFiles(dir, "page_*.png").Any() && !File.Exists(errorFile)))
        {
            CleanupOldPreviews();
            var tmp = dir + ".tmp-" + Guid.NewGuid().ToString("N")[..6];
            try
            {
                var outcome = await RenderAsync(build.Yaml, build.PhotoPath, tmp, full: false, ct);
                if (!outcome.Success)
                {
                    if (outcome.Transient) return new PreviewResult(key, 0, [], build.Warnings, outcome.Error, build.Yaml);
                    await File.WriteAllTextAsync(Path.Combine(tmp, "error.txt"), outcome.Error, ct);
                }

                try
                {
                    if (Directory.Exists(dir)) Directory.Delete(dir, true);
                    Directory.Move(tmp, dir);
                }
                catch (IOException)
                {
                    // Another request rendered the same content concurrently; keep theirs.
                }
            }
            finally
            {
                DeleteQuietly(tmp);
            }
        }

        if (File.Exists(errorFile))
            return new PreviewResult(key, 0, [], build.Warnings, await File.ReadAllTextAsync(errorFile, ct), build.Yaml);

        var marginIn = CvYamlBuilder.ToInches(margin) ?? CvYamlBuilder.ToInches(CvYamlBuilder.DefaultMargin(theme))!.Value;
        var pages = Directory.GetFiles(dir, "page_*.png")
            .Select(f => (file: f, n: int.Parse(PageNumberRegex().Match(f).Groups[1].Value)))
            .OrderBy(p => p.n)
            .Select(p => new PagePreview(p.n, $"/api/preview/{key}/{p.n}", MeasureFill(p.file, pageSize, marginIn)))
            .ToList();
        return new PreviewResult(key, pages.Count, pages, build.Warnings, null, build.Yaml);
    }

    public static double MeasureFill(string png, string pageSize, double marginInches)
    {
        var ink = PngInspector.Inspect(png);
        if (ink is null || ink.LastInkRow < 0) return 0;
        var pxPerInch = ink.Height / CvYamlBuilder.PageHeightInches(pageSize);
        var top = marginInches * pxPerInch;
        var bottom = ink.Height - marginInches * pxPerInch;
        var fill = (ink.LastInkRow - top) / (bottom - top);
        return Math.Round(Math.Clamp(fill, 0, 1), 3);
    }

    public string? PreviewPage(string key, int page)
    {
        if (!HexRegex().IsMatch(key)) return null;
        var file = Path.Combine(paths.PreviewDir, key, $"page_{page}.png");
        return File.Exists(file) ? file : null;
    }

    private void CleanupOldPreviews()
    {
        try
        {
            foreach (var d in Directory.GetDirectories(paths.PreviewDir))
            {
                if (Directory.GetLastWriteTimeUtc(d) < DateTime.UtcNow.AddHours(-12)) Directory.Delete(d, true);
            }
        }
        catch (Exception ex)
        {
            log.LogDebug(ex, "Preview cleanup failed");
        }
    }

    /// <summary>Removes a scratch directory if it still exists; a failure here must not mask the real result.</summary>
    public void DeleteQuietly(string dir)
    {
        try
        {
            if (Directory.Exists(dir)) Directory.Delete(dir, true);
        }
        catch (Exception ex)
        {
            log.LogDebug(ex, "Could not delete {Dir}", dir);
        }
    }

    private static RenderOutcome Fail(string error, bool transient = false) => new(false, error, [], null, null, null, transient);

    private static string Clean(string s) => AnsiRegex().Replace(s, "").Trim();

    [GeneratedRegex(@"page_(\d+)\.png$")]
    private static partial Regex PageNumberRegex();

    [GeneratedRegex(@"\x1B\[[0-9;?]*[A-Za-z]")]
    private static partial Regex AnsiRegex();

    [GeneratedRegex("^[0-9a-f]{24}$")]
    private static partial Regex HexRegex();
}
