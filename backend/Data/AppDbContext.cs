using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using ResumeBuilder.Api.Models;

namespace ResumeBuilder.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Profile> Profiles => Set<Profile>();
    public DbSet<Fragment> Fragments => Set<Fragment>();
    public DbSet<Job> Jobs => Set<Job>();
    public DbSet<Resume> Resumes => Set<Resume>();
    public DbSet<ResumeVersion> Versions => Set<ResumeVersion>();

    internal static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
    };

    /// <summary>Deep-copies a JSON-column value, so two entities never share (and silently co-mutate) one object.</summary>
    internal static T DeepCopy<T>(T value) => JsonSerializer.Deserialize<T>(JsonSerializer.Serialize(value, Json), Json)!;

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Profile>(e =>
        {
            e.Property(p => p.Id).ValueGeneratedNever();
            e.JsonColumn(p => p.SocialNetworks);
            e.JsonColumn(p => p.CustomConnections);
            e.JsonColumn(p => p.DefaultDesign);
        });

        b.Entity<Fragment>(e =>
        {
            e.Property(f => f.Type).HasConversion<string>();
            e.JsonColumn(f => f.Content);
            e.JsonColumn(f => f.Tags);
            e.HasIndex(f => f.Section);
        });

        b.Entity<Job>(e =>
        {
            e.Property(j => j.Status).HasConversion<string>();
            e.JsonColumn(j => j.History);
        });

        b.Entity<Resume>(e =>
        {
            e.JsonColumn(r => r.Sections);
            e.JsonColumn(r => r.Design);
            e.HasOne(r => r.Job).WithMany().HasForeignKey(r => r.JobId).OnDelete(DeleteBehavior.SetNull);
        });

        b.Entity<ResumeVersion>(e =>
        {
            e.HasOne(v => v.Resume).WithMany().HasForeignKey(v => v.ResumeId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(v => v.Job).WithMany().HasForeignKey(v => v.JobId).OnDelete(DeleteBehavior.SetNull);
            e.HasIndex(v => new { v.ResumeId, v.Number }).IsUnique();
        });
    }
}

internal static class JsonColumnExtensions
{
    /// <summary>Stores a complex property as a JSON text column, with a deep comparer so in-place mutations are saved.</summary>
    public static void JsonColumn<TEntity, TProp>(this EntityTypeBuilder<TEntity> e, System.Linq.Expressions.Expression<Func<TEntity, TProp>> prop)
        where TEntity : class where TProp : class, new()
    {
        var comparer = new ValueComparer<TProp>(
            (a, c) => JsonSerializer.Serialize(a, AppDbContext.Json) == JsonSerializer.Serialize(c, AppDbContext.Json),
            v => JsonSerializer.Serialize(v, AppDbContext.Json).GetHashCode(),
            v => JsonSerializer.Deserialize<TProp>(JsonSerializer.Serialize(v, AppDbContext.Json), AppDbContext.Json)!);

        e.Property(prop)
            .HasConversion(
                v => JsonSerializer.Serialize(v, AppDbContext.Json),
                s => string.IsNullOrEmpty(s) ? new TProp() : JsonSerializer.Deserialize<TProp>(s, AppDbContext.Json) ?? new TProp())
            .Metadata.SetValueComparer(comparer);
    }
}
