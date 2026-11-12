using BiletFlow.Api.Data;
using BiletFlow.Api.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace BiletFlow.Api.Services;

/// <summary>
/// Startup seeding: platform settings, the predefined assigned-seating venue and, when <c>Seed:PlatformAdmin:Email</c>
/// and <c>Seed:PlatformAdmin:Password</c> are configured, the first platform administrator (otherwise no admin could
/// ever be created, since public registration only creates attendees and organizers).
/// </summary>
public sealed class DataSeeder(
    AuthDbContext db, PlatformSettingsService settings, SeatingService seating, IPasswordHasher<AppUser> passwordHasher,
    IConfiguration configuration, ILogger<DataSeeder> logger)
{
    public async Task SeedAsync()
    {
        await settings.GetAsync();
        await seating.EnsureDemoVenueAsync();

        var email = configuration["Seed:PlatformAdmin:Email"]?.Trim().ToLowerInvariant();
        var password = configuration["Seed:PlatformAdmin:Password"];
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password)) return;
        if (await db.Users.AnyAsync(user => user.Email == email)) return;

        var admin = new AppUser
        {
            Email = email, PasswordHash = string.Empty, FullName = "Platform Administrator",
            Role = UserRole.PlatformAdmin, EmailConfirmed = true
        };
        admin.PasswordHash = passwordHasher.HashPassword(admin, password);
        db.Users.Add(admin);
        await db.SaveChangesAsync();
        logger.LogInformation("Seeded platform administrator account {Email}.", email);
    }
}
