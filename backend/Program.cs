using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using ResumeBuilder.Api.Data;
using ResumeBuilder.Api.Endpoints;
using ResumeBuilder.Api.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSingleton<AppPaths>();
builder.Services.AddSingleton<RenderCvService>();
builder.Services.AddDbContext<AppDbContext>((sp, o) => o.UseSqlite($"Data Source={sp.GetRequiredService<AppPaths>().DbPath}"));
builder.Services.ConfigureHttpJsonOptions(o =>
{
    o.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    o.SerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase));
});
builder.Services.AddProblemDetails();

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();
}

app.UseExceptionHandler();
app.UseDefaultFiles();
app.UseStaticFiles();

app.MapProfileEndpoints();
app.MapFragmentEndpoints();
app.MapJobEndpoints();
app.MapResumeEndpoints();
app.MapVersionEndpoints();
app.MapSystemEndpoints();

app.MapFallback("/api/{**rest}", () => Results.NotFound());
app.MapFallbackToFile("index.html");

app.Run();
