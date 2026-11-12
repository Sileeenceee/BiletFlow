using BiletFlow.Api.Data;
using BiletFlow.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace BiletFlow.Api.Services;

public sealed class PlatformSettingsService(AuthDbContext db, AuditService audit)
{
    public async Task<PlatformSettings> GetAsync()
    {
        var settings = await db.PlatformSettings.SingleOrDefaultAsync(row => row.Id == PlatformSettings.SingletonId);
        if (settings is not null) return settings;

        settings = new PlatformSettings();
        db.PlatformSettings.Add(settings);
        await db.SaveChangesAsync();
        return settings;
    }

    public async Task<PlatformSettings> UpdateAsync(Guid adminId, UpdatePlatformSettingsRequest request)
    {
        var settings = await GetAsync();
        settings.ActivationFeeKzt = decimal.Round(request.ActivationFeeKzt, 2);
        settings.ProcessingFeePercent = decimal.Round(request.ProcessingFeePercent, 2);
        settings.ProcessingFeeFixedKzt = decimal.Round(request.ProcessingFeeFixedKzt, 2);
        settings.UpdatedAt = DateTimeOffset.UtcNow;
        settings.UpdatedByUserId = adminId;
        audit.Add(AuditActionType.PlatformSettingsUpdated, nameof(PlatformSettings), null, null, adminId,
            $"Platform settings updated: activation fee {settings.ActivationFeeKzt:0.00} KZT, processing fee " +
            $"{settings.ProcessingFeePercent:0.##}% + {settings.ProcessingFeeFixedKzt:0.00} KZT.");
        await db.SaveChangesAsync();
        return settings;
    }

    /// <summary>Simulated processing charge of a paid order; it is deducted from the organizer payout, not added for the attendee.</summary>
    public static decimal CalculateProcessingFee(PlatformSettings settings, decimal orderTotal)
    {
        if (orderTotal <= 0) return 0m;
        var fee = decimal.Round(orderTotal * settings.ProcessingFeePercent / 100m + settings.ProcessingFeeFixedKzt, 2);
        return Math.Min(fee, orderTotal);
    }

    public static PlatformSettingsResponse ToResponse(PlatformSettings settings) => new(
        settings.ActivationFeeKzt, settings.ProcessingFeePercent, settings.ProcessingFeeFixedKzt, "KZT", settings.UpdatedAt);
}
