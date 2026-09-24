using BiletFlow.Api.Data;
using BiletFlow.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace BiletFlow.Api.Services;

public sealed class EventService(AuthDbContext db)
{
    public async Task<IReadOnlyList<Event>> GetOrganizerEventsAsync(Guid organizerId)
    {
        return await db.Events
            .Where(e => e.OrganizerId == organizerId)
            .OrderByDescending(e => e.StartDateUtc)
            .ToListAsync();
    }

    public async Task<(Event? Event, string? Error)> CreateAsync(Guid organizerId, CreateEventRequest request)
    {
        var organizer = await db.Users.SingleOrDefaultAsync(user => user.Id == organizerId);
        if (organizer is null) return (null, "Organizer not found.");

        if (organizer.Role != UserRole.Organizer && organizer.Role != UserRole.PlatformAdmin)
        {
            return (null, "Only organizers can create events.");
        }

        var title = request.Title.Trim();
        if (string.IsNullOrWhiteSpace(title)) return (null, "Title is required.");

        var description = request.Description.Trim();
        if (string.IsNullOrWhiteSpace(description)) return (null, "Description is required.");

        if (request.StartDateUtc >= request.EndDateUtc) return (null, "Event end date must be after the start date.");

        var slug = GenerateSlug(title);
        if (string.IsNullOrWhiteSpace(slug)) return (null, "A valid title is required.");

        var ev = new Event
        {
            OrganizerId = organizerId,
            Title = title,
            Slug = await GenerateUniqueSlugAsync(slug),
            Description = description,
            Venue = request.Venue.Trim(),
            City = request.City.Trim(),
            StartDateUtc = request.StartDateUtc,
            EndDateUtc = request.EndDateUtc,
            IsPublished = request.IsPublished,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };

        db.Events.Add(ev);
        await db.SaveChangesAsync();
        return (ev, null);
    }

    private static string GenerateSlug(string title)
    {
        var slug = new string(title.ToLowerInvariant()
            .Where(ch => char.IsLetterOrDigit(ch) || ch == ' ' || ch == '-')
            .ToArray());

        return string.Join('-', slug.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
    }

    private async Task<string> GenerateUniqueSlugAsync(string baseSlug)
    {
        var candidate = baseSlug;
        var suffix = 1;

        while (await db.Events.AnyAsync(e => e.Slug == candidate))
        {
            candidate = $"{baseSlug}-{suffix}";
            suffix++;
        }

        return candidate;
    }
}
