using BiletFlow.Api.Data;
using BiletFlow.Api.Models;
using Microsoft.EntityFrameworkCore;
using System.Data;

namespace BiletFlow.Api.Services;

public sealed class EventService(AuthDbContext db, AuditService audit)
{
    public async Task<IReadOnlyList<Event>> GetPublishedEventsAsync()
    {
        return await db.Events
            .Where(e => e.IsPublished && !e.IsCancelled && e.Visibility == EventVisibility.Public)
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

    public async Task<Event?> GetEventAsync(Guid eventId, Guid? requesterId, bool isPlatformAdmin)
    {
        var ev = await db.Events.SingleOrDefaultAsync(candidate => candidate.Id == eventId);
        if (ev is null || ev.IsCancelled) return null;

        var canManage = isPlatformAdmin || requesterId == ev.OrganizerId;
        return canManage || (ev.IsPublished && ev.Visibility != EventVisibility.Private) ? ev : null;
    }

    public async Task<(Event? Event, string? Error)> CreateAsync(Guid organizerId, CreateEventRequest request)
    {
        var organizer = await db.Users.SingleOrDefaultAsync(user => user.Id == organizerId);
        if (organizer is null) return (null, "Organizer not found.");

        if (organizer.Role != UserRole.Organizer && organizer.Role != UserRole.PlatformAdmin)
        {
            return (null, "Only organizers can create events.");
        }

        var error = ValidateRequest(request);
        if (error is not null) return (null, error);

        var slug = GenerateSlug(request.Title);
        if (string.IsNullOrWhiteSpace(slug)) return (null, "A valid title is required.");

        var ev = new Event
        {
            OrganizerId = organizerId,
            Title = request.Title.Trim(),
            Slug = await GenerateUniqueSlugAsync(slug),
            Description = request.Description.Trim(),
            Venue = request.Venue.Trim(),
            City = request.City.Trim(),
            Category = NormalizeCategory(request.Category),
            ImageUrls = NormalizeImageUrls(request.ImageUrls),
            StartDateUtc = request.StartDateUtc,
            EndDateUtc = request.EndDateUtc,
            IsPublished = request.IsPublished,
            Visibility = request.Visibility,
            RegistrationOpensAt = request.RegistrationOpensAt,
            RegistrationClosesAt = request.RegistrationClosesAt,
            Capacity = request.Capacity,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };

        db.Events.Add(ev);
        await db.SaveChangesAsync();
        return (ev, null);
    }

    public async Task<(Event? Event, string? Error)> UpdateAsync(
        Guid eventId, Guid organizerId, bool isPlatformAdmin, CreateEventRequest request)
    {
        var ev = await GetManagedEventAsync(eventId, organizerId, isPlatformAdmin);
        if (ev is null) return (null, "Event not found.");
        if (ev.IsCancelled) return (null, "A cancelled event cannot be updated.");

        var error = ValidateRequest(request);
        if (error is not null) return (null, error);
        if (request.Capacity is not null && request.Capacity < ev.TicketsIssued + ev.TicketsReserved)
        {
            return (null, "Capacity cannot be lower than tickets already issued or reserved.");
        }

        var slug = GenerateSlug(request.Title);
        if (string.IsNullOrWhiteSpace(slug)) return (null, "A valid title is required.");

        ev.Title = request.Title.Trim();
        ev.Slug = await GenerateUniqueSlugAsync(slug, eventId);
        ev.Description = request.Description.Trim();
        ev.Venue = request.Venue.Trim();
        ev.City = request.City.Trim();
        ev.Category = NormalizeCategory(request.Category);
        ev.ImageUrls = NormalizeImageUrls(request.ImageUrls);
        ev.StartDateUtc = request.StartDateUtc;
        ev.EndDateUtc = request.EndDateUtc;
        ev.IsPublished = request.IsPublished;
        ev.Visibility = request.Visibility;
        ev.RegistrationOpensAt = request.RegistrationOpensAt;
        ev.RegistrationClosesAt = request.RegistrationClosesAt;
        ev.Capacity = request.Capacity;
        ev.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync();
        return (ev, null);
    }

    public async Task<(Event? Event, string? Error)> DuplicateAsync(Guid eventId, Guid organizerId, bool isPlatformAdmin)
    {
        var source = await db.Events
            .Include(candidate => candidate.TicketTypes)
            .SingleOrDefaultAsync(candidate => candidate.Id == eventId &&
                (candidate.OrganizerId == organizerId || isPlatformAdmin));
        if (source is null) return (null, "Event not found.");

        var now = DateTimeOffset.UtcNow;
        var copy = new Event
        {
            OrganizerId = source.OrganizerId,
            Title = $"{source.Title} (copy)",
            Slug = await GenerateUniqueSlugAsync(GenerateSlug($"{source.Title} copy")),
            Description = source.Description,
            Venue = source.Venue,
            City = source.City,
            Category = source.Category,
            ImageUrls = [.. source.ImageUrls],
            StartDateUtc = source.StartDateUtc,
            EndDateUtc = source.EndDateUtc,
            IsPublished = false,
            Visibility = source.Visibility,
            RegistrationOpensAt = source.RegistrationOpensAt,
            RegistrationClosesAt = source.RegistrationClosesAt,
            Capacity = source.Capacity,
            CreatedAt = now,
            UpdatedAt = now,
            TicketTypes = source.TicketTypes.Select(ticketType => new TicketType
            {
                Name = ticketType.Name,
                Description = ticketType.Description,
                Price = ticketType.Price,
                Quantity = ticketType.Quantity,
                SalesStartAt = ticketType.SalesStartAt,
                SalesEndAt = ticketType.SalesEndAt,
                MaxPerOrder = ticketType.MaxPerOrder,
                IsHidden = ticketType.IsHidden
            }).ToList()
        };

        db.Events.Add(copy);
        await db.SaveChangesAsync();
        return (copy, null);
    }

    public async Task<(bool Deleted, string? Error)> DeleteAsync(Guid eventId, Guid organizerId, bool isPlatformAdmin)
    {
        var ev = await GetManagedEventAsync(eventId, organizerId, isPlatformAdmin);
        if (ev is null) return (false, "Event not found.");
        if (await db.Orders.AnyAsync(order => order.EventId == eventId) ||
            await db.SupportCases.AnyAsync(supportCase => supportCase.EventId == eventId) ||
            await db.AuditLogs.AnyAsync(log => log.EventId == eventId))
        {
            return (false, "Events with order, support, or audit history cannot be deleted. Cancel the event instead.");
        }

        var campaigns = await db.PromoCampaigns.Where(campaign => campaign.EventId == eventId).ToListAsync();
        db.PromoCampaigns.RemoveRange(campaigns);
        db.Events.Remove(ev);
        await db.SaveChangesAsync();
        return (true, null);
    }

    public async Task<(Event? Event, string? Error)> CancelAsync(Guid eventId, Guid organizerId, bool isPlatformAdmin)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        var ev = await db.Events.SingleOrDefaultAsync(candidate =>
            candidate.Id == eventId && (candidate.OrganizerId == organizerId || isPlatformAdmin));
        if (ev is null) return (null, "Event not found.");
        if (ev.IsCancelled) return (ev, null);

        var pendingOrders = await db.Orders
            .Include(order => order.Items)
            .Where(order => order.EventId == eventId && order.Status == OrderStatus.Pending)
            .ToListAsync();
        var ticketTypes = await db.TicketTypes.Where(ticketType => ticketType.EventId == eventId)
            .ToDictionaryAsync(ticketType => ticketType.Id);

        foreach (var order in pendingOrders)
        {
            foreach (var group in order.Items.GroupBy(item => item.TicketTypeId))
            {
                var quantity = group.Count();
                ticketTypes[group.Key].ReservedQuantity -= quantity;
                ev.TicketsReserved -= quantity;
            }

            order.Status = OrderStatus.Cancelled;
            audit.Add(AuditActionType.OrderCancelled, nameof(Order), order.Id, ev.Id, organizerId,
                "Pending order cancelled because its event was cancelled.");
        }

        ev.IsCancelled = true;
        ev.IsPublished = false;
        ev.UpdatedAt = DateTimeOffset.UtcNow;
        audit.Add(AuditActionType.EventCancelled, nameof(Event), ev.Id, ev.Id, organizerId, "Event cancelled by its organizer.");
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return (ev, null);
    }

    private async Task<Event?> GetManagedEventAsync(Guid eventId, Guid organizerId, bool isPlatformAdmin) =>
        await db.Events.SingleOrDefaultAsync(candidate =>
            candidate.Id == eventId && (candidate.OrganizerId == organizerId || isPlatformAdmin));

    private static string? ValidateRequest(CreateEventRequest request)
    {
        var title = request.Title?.Trim() ?? string.Empty;
        if (title.Length is < 3 or > 120) return "Title must be between 3 and 120 characters.";

        var description = request.Description?.Trim() ?? string.Empty;
        if (description.Length is < 20 or > 4000) return "Description must be between 20 and 4000 characters.";

        var venue = request.Venue?.Trim() ?? string.Empty;
        if (venue.Length is < 1 or > 250) return "Venue is required and must be at most 250 characters.";

        var city = request.City?.Trim() ?? string.Empty;
        if (city.Length is < 1 or > 120) return "City is required and must be at most 120 characters.";

        if (request.StartDateUtc >= request.EndDateUtc) return "Event end date must be after the start date.";
        if (request.Capacity is < 1) return "Capacity must be at least 1 or left empty for unlimited.";
        if (request.Category?.Trim().Length > 120) return "Category must be at most 120 characters.";
        if (!Enum.IsDefined(request.Visibility)) return "Event visibility is invalid.";
        if (request.RegistrationOpensAt is not null && request.RegistrationClosesAt is not null &&
            request.RegistrationOpensAt >= request.RegistrationClosesAt)
        {
            return "Registration close must be after registration open.";
        }

        if (request.ImageUrls is { Length: > 10 } ||
            request.ImageUrls?.Any(url => !Uri.TryCreate(url, UriKind.Absolute, out var uri) ||
                uri.Scheme is not ("http" or "https")) == true)
        {
            return "Provide at most 10 absolute HTTP or HTTPS image URLs.";
        }

        return null;
    }

    private static string? NormalizeCategory(string? category) =>
        string.IsNullOrWhiteSpace(category) ? null : category.Trim();

    private static string[] NormalizeImageUrls(string[]? imageUrls) =>
        imageUrls?.Select(url => url.Trim()).ToArray() ?? [];

    private static string GenerateSlug(string title)
    {
        var slug = new string(title.ToLowerInvariant()
            .Where(ch => char.IsLetterOrDigit(ch) || ch == ' ' || ch == '-')
            .ToArray());

        return string.Join('-', slug.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
    }

    private async Task<string> GenerateUniqueSlugAsync(string baseSlug, Guid? exceptEventId = null)
    {
        var candidate = baseSlug;
        var suffix = 1;

        while (await db.Events.AnyAsync(e => e.Slug == candidate && e.Id != exceptEventId))
        {
            candidate = $"{baseSlug}-{suffix}";
            suffix++;
        }

        return candidate;
    }
}
