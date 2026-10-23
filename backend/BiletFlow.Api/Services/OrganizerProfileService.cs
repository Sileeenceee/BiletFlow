using BiletFlow.Api.Data;
using BiletFlow.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace BiletFlow.Api.Services;

public sealed class OrganizerProfileService(AuthDbContext db)
{
    public async Task<OrganizerProfile?> GetByUserIdAsync(Guid userId)
    {
        return await db.OrganizerProfiles
            .Include(profile => profile.User)
            .SingleOrDefaultAsync(profile => profile.UserId == userId);
    }

    public async Task<(OrganizerProfile? Profile, string? Error)> CreateAsync(Guid userId, OrganizerProfileRequest request)
    {
        var user = await db.Users.SingleOrDefaultAsync(candidate => candidate.Id == userId);
        if (user is null) return (null, "User not found.");

        if (user.Role != UserRole.Organizer && user.Role != UserRole.PlatformAdmin)
        {
            return (null, "Only organizers can create an organizer profile.");
        }

        if (await db.OrganizerProfiles.AnyAsync(profile => profile.UserId == userId))
        {
            return (null, "Organizer profile already exists.");
        }

        var error = ValidateRequest(request);
        if (error is not null) return (null, error);

        var profile = new OrganizerProfile
        {
            UserId = userId,
            BusinessName = request.BusinessName.Trim(),
            DisplayName = request.DisplayName.Trim(),
            ContactEmail = string.IsNullOrWhiteSpace(request.ContactEmail) ? user.Email : request.ContactEmail.Trim(),
            SandboxPayoutProvider = NormalizeOptional(request.SandboxPayoutProvider),
            SandboxPayoutReference = NormalizeOptional(request.SandboxPayoutReference),
            IsVerified = false,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        db.OrganizerProfiles.Add(profile);
        await db.SaveChangesAsync();
        return (profile, null);
    }

    public async Task<(OrganizerProfile? Profile, string? Error)> UpdateAsync(Guid userId, OrganizerProfileRequest request)
    {
        var profile = await db.OrganizerProfiles
            .Include(candidate => candidate.User)
            .SingleOrDefaultAsync(candidate => candidate.UserId == userId);
        if (profile is null) return (null, "Organizer profile not found.");

        var error = ValidateRequest(request);
        if (error is not null) return (null, error);

        profile.BusinessName = request.BusinessName.Trim();
        profile.DisplayName = request.DisplayName.Trim();
        profile.ContactEmail = string.IsNullOrWhiteSpace(request.ContactEmail) ? profile.User.Email : request.ContactEmail.Trim();
        profile.SandboxPayoutProvider = NormalizeOptional(request.SandboxPayoutProvider);
        profile.SandboxPayoutReference = NormalizeOptional(request.SandboxPayoutReference);
        profile.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync();
        return (profile, null);
    }

    public async Task<bool> DeleteAsync(Guid userId)
    {
        var profile = await db.OrganizerProfiles.SingleOrDefaultAsync(candidate => candidate.UserId == userId);
        if (profile is null) return false;

        db.OrganizerProfiles.Remove(profile);
        await db.SaveChangesAsync();
        return true;
    }

    private static string? ValidateRequest(OrganizerProfileRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.BusinessName) || request.BusinessName.Trim().Length > 200)
        {
            return "Business name is required and must be at most 200 characters.";
        }

        if (string.IsNullOrWhiteSpace(request.DisplayName) || request.DisplayName.Trim().Length > 120)
        {
            return "Display name is required and must be at most 120 characters.";
        }

        if (!string.IsNullOrWhiteSpace(request.ContactEmail) &&
            (request.ContactEmail.Trim().Length > 320 ||
             !System.Net.Mail.MailAddress.TryCreate(request.ContactEmail.Trim(), out _)))
        {
            return "Contact email must be a valid email address of at most 320 characters.";
        }

        if ((string.IsNullOrWhiteSpace(request.SandboxPayoutProvider) !=
                string.IsNullOrWhiteSpace(request.SandboxPayoutReference)) ||
            request.SandboxPayoutProvider?.Trim().Length > 100 ||
            request.SandboxPayoutReference?.Trim().Length > 200)
        {
            return "Provide both a sandbox payout provider (up to 100 characters) and reference (up to 200 characters), or leave both empty.";
        }

        return null;
    }

    private static string? NormalizeOptional(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
