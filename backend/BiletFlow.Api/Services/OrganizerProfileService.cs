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

    public async Task<(OrganizerProfile? Profile, string? Error)> CreateOrUpdateAsync(Guid userId, OrganizerProfileRequest request)
    {
        var user = await db.Users.SingleOrDefaultAsync(candidate => candidate.Id == userId);
        if (user is null) return (null, "User not found.");

        if (user.Role != UserRole.Organizer && user.Role != UserRole.PlatformAdmin)
        {
            return (null, "Only organizers can create an organizer profile.");
        }

        var businessName = request.BusinessName.Trim();
        var displayName = request.DisplayName.Trim();

        if (string.IsNullOrWhiteSpace(businessName) || string.IsNullOrWhiteSpace(displayName))
        {
            return (null, "Business name and display name are required.");
        }

        var existing = await db.OrganizerProfiles.SingleOrDefaultAsync(profile => profile.UserId == userId);

        if (existing is null)
        {
            var profile = new OrganizerProfile
            {
                UserId = userId,
                BusinessName = businessName,
                DisplayName = displayName,
                ContactEmail = string.IsNullOrWhiteSpace(request.ContactEmail) ? user.Email : request.ContactEmail.Trim(),
                PhoneNumber = request.PhoneNumber?.Trim(),
                Bio = request.Bio?.Trim(),
                Website = request.Website?.Trim(),
                IsVerified = false,
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow
            };

            db.OrganizerProfiles.Add(profile);
            await db.SaveChangesAsync();
            return (profile, null);
        }

        existing.BusinessName = businessName;
        existing.DisplayName = displayName;
        existing.ContactEmail = string.IsNullOrWhiteSpace(request.ContactEmail) ? user.Email : request.ContactEmail.Trim();
        existing.PhoneNumber = request.PhoneNumber?.Trim();
        existing.Bio = request.Bio?.Trim();
        existing.Website = request.Website?.Trim();
        existing.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync();
        return (existing, null);
    }
}
