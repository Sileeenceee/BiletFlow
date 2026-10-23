using System.Security.Cryptography;
using BiletFlow.Api.Data;
using BiletFlow.Api.Models;
using Microsoft.EntityFrameworkCore;
using QRCoder;

namespace BiletFlow.Api.Services;

public sealed class PromoCampaignService(AuthDbContext db, AuditService audit, IConfiguration configuration)
{
    public async Task<IReadOnlyList<PromoCampaignResponse>?> GetForEventAsync(
        Guid eventId, Guid userId, bool isPlatformAdmin)
    {
        if (!await CanManageEventAsync(eventId, userId, isPlatformAdmin)) return null;
        var campaigns = await db.PromoCampaigns
            .Include(campaign => campaign.ApplicableTicketTypes)
            .Where(campaign => campaign.EventId == eventId)
            .OrderByDescending(campaign => campaign.CreatedAt)
            .ToListAsync();
        return await Task.WhenAll(campaigns.Select(ToResponseAsync));
    }

    public async Task<IReadOnlyList<PromoCampaignAnalyticsResponse>?> GetAnalyticsAsync(
        Guid eventId, Guid userId, bool isPlatformAdmin)
    {
        if (!await CanManageEventAsync(eventId, userId, isPlatformAdmin)) return null;
        var campaigns = await db.PromoCampaigns.AsNoTracking()
            .Include(campaign => campaign.Orders.Where(order => order.Status == OrderStatus.Confirmed))
                .ThenInclude(order => order.Items)
            .Where(campaign => campaign.EventId == eventId)
            .ToListAsync();

        return campaigns.Select(campaign =>
        {
            var orders = campaign.Orders;
            var items = orders.SelectMany(order => order.Items).ToList();
            var gross = items.Sum(item => item.UnitPrice);
            var discount = items.Sum(item => item.DiscountAmount);
            return new PromoCampaignAnalyticsResponse(
                campaign.Id, campaign.Code, orders.Count, items.Count,
                gross, discount, gross - discount);
        }).ToList();
    }

    public async Task<(PromoCampaignResponse? Campaign, string? Error)> CreateAsync(
        Guid eventId, Guid userId, bool isPlatformAdmin, CreatePromoCampaignRequest request)
    {
        if (!await CanManageEventAsync(eventId, userId, isPlatformAdmin)) return (null, "Event not found.");
        var error = await ValidateAsync(eventId, request);
        if (error is not null) return (null, error);

        var code = NormalizeCode(request.Code);
        if (await db.PromoCampaigns.AnyAsync(campaign => campaign.Code == code))
        {
            return (null, "Promo code already exists.");
        }

        var campaign = new PromoCampaign
        {
            EventId = eventId,
            CreatedByUserId = userId,
            Code = code,
            CampaignToken = CreateToken(),
            DiscountType = ParseDiscountType(request.DiscountType),
            DiscountValue = decimal.Round(request.DiscountValue, 2),
            StartsAt = request.StartsAt,
            EndsAt = request.EndsAt,
            MaxRedemptions = request.MaxRedemptions,
            IsEnabled = true
        };
        SetTicketTypes(campaign, request.TicketTypeIds);
        db.PromoCampaigns.Add(campaign);
        audit.Add(AuditActionType.PromoCampaignCreated, nameof(PromoCampaign), campaign.Id, eventId, userId,
            $"Promo campaign '{campaign.Code}' created.");
        await db.SaveChangesAsync();
        await db.Entry(campaign).Collection(candidate => candidate.ApplicableTicketTypes).LoadAsync();
        return (await ToResponseAsync(campaign), null);
    }

    public async Task<(PromoCampaignResponse? Campaign, string? Error)> UpdateAsync(
        Guid eventId, Guid campaignId, Guid userId, bool isPlatformAdmin, CreatePromoCampaignRequest request)
    {
        if (!await CanManageEventAsync(eventId, userId, isPlatformAdmin)) return (null, "Event not found.");
        var campaign = await db.PromoCampaigns
            .Include(candidate => candidate.ApplicableTicketTypes)
            .SingleOrDefaultAsync(candidate => candidate.Id == campaignId && candidate.EventId == eventId);
        if (campaign is null) return (null, "Promo campaign not found.");

        var error = await ValidateAsync(eventId, request);
        if (error is not null) return (null, error);

        var code = NormalizeCode(request.Code);
        if (await db.PromoCampaigns.AnyAsync(candidate => candidate.Code == code && candidate.Id != campaignId))
        {
            return (null, "Promo code already exists.");
        }

        campaign.Code = code;
        campaign.DiscountType = ParseDiscountType(request.DiscountType);
        campaign.DiscountValue = decimal.Round(request.DiscountValue, 2);
        campaign.StartsAt = request.StartsAt;
        campaign.EndsAt = request.EndsAt;
        campaign.MaxRedemptions = request.MaxRedemptions;
        SetTicketTypes(campaign, request.TicketTypeIds);
        audit.Add(AuditActionType.PromoCampaignUpdated, nameof(PromoCampaign), campaign.Id, eventId, userId,
            $"Promo campaign '{campaign.Code}' updated.");
        await db.SaveChangesAsync();
        return (await ToResponseAsync(campaign), null);
    }

    public async Task<(bool Deleted, string? Error)> DeleteAsync(
        Guid eventId, Guid campaignId, Guid userId, bool isPlatformAdmin)
    {
        if (!await CanManageEventAsync(eventId, userId, isPlatformAdmin)) return (false, "Event not found.");
        var campaign = await db.PromoCampaigns
            .Include(candidate => candidate.ApplicableTicketTypes)
            .SingleOrDefaultAsync(candidate => candidate.Id == campaignId && candidate.EventId == eventId);
        if (campaign is null) return (false, "Promo campaign not found.");

        if (await db.Orders.AnyAsync(order => order.PromoCampaignId == campaignId))
        {
            if (!campaign.IsEnabled) return (true, null);
            campaign.IsEnabled = false;
            audit.Add(AuditActionType.PromoCampaignDisabled, nameof(PromoCampaign), campaign.Id, eventId, userId,
                $"Promo campaign '{campaign.Code}' disabled; redemption history retained.");
            await db.SaveChangesAsync();
            return (true, null);
        }

        db.PromoCampaigns.Remove(campaign);
        await db.SaveChangesAsync();
        return (true, null);
    }

    public async Task<(PromoCampaignResolveResponse? Campaign, string? Error)> ResolveAsync(string token)
    {
        var campaign = await db.PromoCampaigns
            .Include(candidate => candidate.Event)
            .SingleOrDefaultAsync(candidate => candidate.CampaignToken == token);
        if (campaign is null || !IsAvailable(campaign, DateTimeOffset.UtcNow) ||
            !campaign.Event.IsPublished || campaign.Event.IsCancelled ||
            campaign.Event.Visibility == EventVisibility.Private)
        {
            return (null, "This promo campaign is invalid, expired, or disabled.");
        }

        await db.PromoCampaigns
            .Where(candidate => candidate.Id == campaign.Id)
            .ExecuteUpdateAsync(set => set.SetProperty(candidate => candidate.LinkVisits, candidate => candidate.LinkVisits + 1));
        return (new PromoCampaignResolveResponse(
            campaign.EventId,
            campaign.Event.Title,
            campaign.Code,
            campaign.DiscountType.ToString(),
            campaign.DiscountValue,
            campaign.EndsAt,
            "Campaign link validated. The promo code will be revalidated during checkout."), null);
    }

    public async Task<byte[]?> GetCampaignQrAsync(Guid eventId, Guid campaignId, Guid userId, bool isPlatformAdmin)
    {
        if (!await CanManageEventAsync(eventId, userId, isPlatformAdmin)) return null;
        var token = await db.PromoCampaigns
            .Where(campaign => campaign.EventId == eventId && campaign.Id == campaignId)
            .Select(campaign => campaign.CampaignToken)
            .SingleOrDefaultAsync();
        if (token is null) return null;

        using var generator = new QRCodeGenerator();
        using var data = generator.CreateQrCode(BuildCampaignUrl(token), QRCodeGenerator.ECCLevel.Q);
        return new PngByteQRCode(data).GetGraphic(8);
    }

    public async Task<PromoCampaign?> FindApplicableCampaignAsync(
        Guid eventId, string? code, string? token, IReadOnlyCollection<Guid> selectedTicketTypeIds,
        Guid? currentOrderId, DateTimeOffset now)
    {
        if (!string.IsNullOrWhiteSpace(code) && !string.IsNullOrWhiteSpace(token)) return null;
        if (string.IsNullOrWhiteSpace(code) && string.IsNullOrWhiteSpace(token)) return null;

        var campaigns = db.PromoCampaigns
            .Include(candidate => candidate.ApplicableTicketTypes)
            .Where(candidate => candidate.EventId == eventId);
        var campaign = !string.IsNullOrWhiteSpace(token)
            ? await campaigns.SingleOrDefaultAsync(candidate => candidate.CampaignToken == token)
            : await campaigns.SingleOrDefaultAsync(candidate => candidate.Code == NormalizeCode(code!));
        if (campaign is null || !IsAvailable(campaign, now)) return null;

        var selectedIds = selectedTicketTypeIds.ToHashSet();
        var applicableIds = campaign.ApplicableTicketTypes.Select(row => row.TicketTypeId).ToHashSet();
        if (applicableIds.Count > 0 && !selectedIds.Any(applicableIds.Contains)) return null;

        if (campaign.MaxRedemptions is not null)
        {
            var redemptionCount = await db.Orders.CountAsync(order =>
                order.PromoCampaignId == campaign.Id &&
                (order.Status == OrderStatus.Confirmed ||
                 (order.Status == OrderStatus.Pending && order.CreatedAt > now - TicketingService.ReservationTime)) &&
                order.Id != currentOrderId);
            if (redemptionCount >= campaign.MaxRedemptions) return null;
        }

        return campaign;
    }

    public async Task<decimal?> ApplyDiscountAsync(
        PromoCampaign campaign, ICollection<OrderItem> items)
    {
        var applicableIds = await db.PromoCampaignTicketTypes
            .Where(row => row.CampaignId == campaign.Id)
            .Select(row => row.TicketTypeId)
            .ToListAsync();
        var eligibleItems = items.Where(item => applicableIds.Count == 0 || applicableIds.Contains(item.TicketTypeId)).ToList();
        if (eligibleItems.Count == 0) return null;

        decimal remaining;
        if (campaign.DiscountType == PromoDiscountType.Percentage)
        {
            foreach (var item in eligibleItems)
            {
                item.DiscountAmount = decimal.Round(item.UnitPrice * campaign.DiscountValue / 100m, 2);
            }
        }
        else
        {
            remaining = campaign.DiscountValue;
            foreach (var item in eligibleItems)
            {
                var discount = Math.Min(item.UnitPrice, remaining);
                item.DiscountAmount = decimal.Round(discount, 2);
                remaining -= item.DiscountAmount;
                if (remaining <= 0) break;
            }
        }

        return eligibleItems.Sum(item => item.DiscountAmount);
    }

    private async Task<string?> ValidateAsync(Guid eventId, CreatePromoCampaignRequest request)
    {
        var code = NormalizeCode(request.Code ?? string.Empty);
        if (code.Length is < 3 or > 40 || code.Any(character => !char.IsAsciiLetterOrDigit(character) && character != '-'))
        {
            return "Promo code must be 3-40 letters, digits, or hyphens.";
        }

        if (!Enum.TryParse<PromoDiscountType>(request.DiscountType, true, out var type) || !Enum.IsDefined(type))
        {
            return "Discount type must be Percentage or FixedKzt.";
        }

        if (type == PromoDiscountType.Percentage && request.DiscountValue > 100)
        {
            return "Percentage discount cannot exceed 100.";
        }

        if (request.StartsAt is not null && request.EndsAt is not null && request.EndsAt <= request.StartsAt)
        {
            return "Campaign end must be after campaign start.";
        }

        if (request.TicketTypeIds is { Count: > 0 })
        {
            var ids = request.TicketTypeIds.Distinct().ToArray();
            var count = await db.TicketTypes.CountAsync(ticketType =>
                ticketType.EventId == eventId && ids.Contains(ticketType.Id));
            if (count != ids.Length) return "All applicable ticket types must belong to this event.";
        }

        return null;
    }

    private void SetTicketTypes(PromoCampaign campaign, IReadOnlyList<Guid>? ticketTypeIds)
    {
        var existing = campaign.ApplicableTicketTypes.ToList();
        db.PromoCampaignTicketTypes.RemoveRange(existing);
        campaign.ApplicableTicketTypes.Clear();
        foreach (var ticketTypeId in ticketTypeIds?.Distinct() ?? Enumerable.Empty<Guid>())
        {
            campaign.ApplicableTicketTypes.Add(new PromoCampaignTicketType
            {
                CampaignId = campaign.Id,
                TicketTypeId = ticketTypeId
            });
        }
    }

    private async Task<PromoCampaignResponse> ToResponseAsync(PromoCampaign campaign)
    {
        var redemptions = await db.Orders.CountAsync(order =>
            order.PromoCampaignId == campaign.Id &&
            (order.Status == OrderStatus.Confirmed ||
             (order.Status == OrderStatus.Pending && order.CreatedAt > DateTimeOffset.UtcNow - TicketingService.ReservationTime)));
        return new PromoCampaignResponse(
            campaign.Id, campaign.EventId, campaign.Code, campaign.DiscountType.ToString(), campaign.DiscountValue,
            campaign.StartsAt, campaign.EndsAt, campaign.MaxRedemptions, redemptions, campaign.IsEnabled,
            campaign.LinkVisits, campaign.ApplicableTicketTypes.Select(row => row.TicketTypeId).ToList(),
            BuildCampaignUrl(campaign.CampaignToken));
    }

    private Task<bool> CanManageEventAsync(Guid eventId, Guid userId, bool isPlatformAdmin) =>
        db.Events.AnyAsync(ev => ev.Id == eventId && (ev.OrganizerId == userId || isPlatformAdmin));

    private string BuildCampaignUrl(string token)
    {
        var baseUrl = configuration["PublicAppBaseUrl"] ?? "https://localhost:8080";
        if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps)
        {
            throw new InvalidOperationException("PublicAppBaseUrl must be an absolute HTTPS URL.");
        }

        return $"{baseUrl.TrimEnd('/')}/campaign/{Uri.EscapeDataString(token)}";
    }

    private static bool IsAvailable(PromoCampaign campaign, DateTimeOffset now) =>
        campaign.IsEnabled && (campaign.StartsAt is null || campaign.StartsAt <= now) &&
        (campaign.EndsAt is null || campaign.EndsAt > now);

    private static PromoDiscountType ParseDiscountType(string value) =>
        Enum.Parse<PromoDiscountType>(value, true);

    private static string NormalizeCode(string code) => code.Trim().ToUpperInvariant();

    private static string CreateToken() => "CMP_" + Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
        .TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
