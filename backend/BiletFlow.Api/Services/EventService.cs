using BiletFlow.Api.Data;
using BiletFlow.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace BiletFlow.Api.Services;

public sealed class EventService(AuthDbContext db)
{
    public async Task<IReadOnlyList<Event>> GetPublishedEventsAsync()
    {
        return await db.Events
            .Where(e => e.IsPublished)
            .OrderBy(e => e.StartDateUtc)
            .ToListAsync();
    }

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

        // Same limits as the create-event form, plus the column sizes in AuthDbContext.
        var title = request.Title.Trim();
        if (title.Length is < 3 or > 120) return (null, "Title must be between 3 and 120 characters.");

        var description = request.Description.Trim();
        if (description.Length is < 20 or > 4000) return (null, "Description must be between 20 and 4000 characters.");

        var venue = request.Venue.Trim();
        if (venue.Length is < 1 or > 250) return (null, "Venue is required and must be at most 250 characters.");

        var city = request.City.Trim();
        if (city.Length is < 1 or > 120) return (null, "City is required and must be at most 120 characters.");

        if (request.StartDateUtc >= request.EndDateUtc) return (null, "Event end date must be after the start date.");

        if (request.Capacity is < 1) return (null, "Capacity must be at least 1 or left empty for unlimited.");

        var slug = GenerateSlug(title);
        if (string.IsNullOrWhiteSpace(slug)) return (null, "A valid title is required.");

        var ev = new Event
        {
            OrganizerId = organizerId,
            Title = title,
            Slug = await GenerateUniqueSlugAsync(slug),
            Description = description,
            Venue = venue,
            City = city,
            StartDateUtc = request.StartDateUtc,
            EndDateUtc = request.EndDateUtc,
            IsPublished = request.IsPublished,
            Capacity = request.Capacity,
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
