using Microsoft.EntityFrameworkCore;
using ResumeBuilder.Api.Data;
using ResumeBuilder.Api.Models;
using ResumeBuilder.Api.Services;

namespace ResumeBuilder.Api.Endpoints;

public static class ProfileEndpoints
{
    private static readonly string[] PhotoExtensions = [".jpg", ".jpeg", ".png", ".webp"];

    public static async Task<Profile> GetProfileAsync(this AppDbContext db)
    {
        var profile = await db.Profiles.FirstOrDefaultAsync(p => p.Id == 1);
        if (profile is not null) return profile;
        profile = new Profile();
        db.Profiles.Add(profile);
        await db.SaveChangesAsync();
        return profile;
    }

    public static string? PhotoPath(this Profile p, AppPaths paths) =>
        p.PhotoFile is null ? null : Path.Combine(paths.UploadsDir, p.PhotoFile);

    public static void MapProfileEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/profile");

        g.MapGet("", async (AppDbContext db) => await db.GetProfileAsync());

        g.MapPut("", async (Profile input, AppDbContext db) =>
        {
            var p = await db.GetProfileAsync();
            p.Name = string.IsNullOrWhiteSpace(input.Name) ? "Your Name" : input.Name.Trim();
            p.Headline = input.Headline;
            p.Location = input.Location;
            p.Email = input.Email;
            p.Phone = input.Phone;
            p.Website = input.Website;
            p.SocialNetworks = input.SocialNetworks;
            p.CustomConnections = input.CustomConnections;
            p.DefaultDesign = input.DefaultDesign;
            p.DefaultTargetPages = Math.Clamp(input.DefaultTargetPages, 1, 5);
            await db.SaveChangesAsync();
            return p;
        });

        g.MapPost("/photo", async (IFormFile file, AppDbContext db, AppPaths paths) =>
        {
            var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
            if (!PhotoExtensions.Contains(ext)) return Results.BadRequest(new { error = "Use a JPG, PNG or WebP image." });
            if (file.Length > 10 * 1024 * 1024) return Results.BadRequest(new { error = "Photos must be under 10 MB." });

            var p = await db.GetProfileAsync();
            if (p.PhotoPath(paths) is { } old && File.Exists(old)) File.Delete(old);
            p.PhotoFile = $"photo-{DateTime.UtcNow:yyyyMMddHHmmss}{ext}";
            await using (var fs = File.Create(Path.Combine(paths.UploadsDir, p.PhotoFile))) await file.CopyToAsync(fs);
            await db.SaveChangesAsync();
            return Results.Ok(p);
        }).DisableAntiforgery();

        g.MapDelete("/photo", async (AppDbContext db, AppPaths paths) =>
        {
            var p = await db.GetProfileAsync();
            if (p.PhotoPath(paths) is { } old && File.Exists(old)) File.Delete(old);
            p.PhotoFile = null;
            await db.SaveChangesAsync();
            return p;
        });

        g.MapGet("/photo", async (AppDbContext db, AppPaths paths) =>
        {
            var p = await db.GetProfileAsync();
            return p.PhotoPath(paths) is { } path && File.Exists(path) ? Results.File(path) : Results.NotFound();
        });
    }
}
