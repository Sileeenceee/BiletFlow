using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace BiletFlow.Api.Tests;

/// <summary>
/// End-to-end checks of the SRS features added to finalize the backend: paid-sales activation checklist, processing
/// fees, refunds, analytics, history, calendar export, assigned seating, event cancellation and platform moderation.
/// Like <see cref="TicketingRegressionTests"/>, they run only against a disposable test API
/// (BILETFLOW_TEST_API_BASE_URL) and use the platform admin seeded in Development.
/// </summary>
public sealed class SrsFeatureRegressionTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private const string Password = "TestPassword123!";

    [TicketingRegressionTests.RequiresTestApiFact]
    public async Task PaidOrderWithPromoIsChargedFeeRefundedAndReportedInAnalyticsHistoryAndCalendar()
    {
        using var client = factory.CreateClient();
        var suffix = Guid.NewGuid().ToString("N")[..10];
        var organizer = await RegisterAsync(client, $"org-{suffix}@example.test", organizer: true);
        var attendee = await RegisterAsync(client, $"att-{suffix}@example.test");
        var eventId = await CreateEventAsync(client, organizer, $"Paid flow {suffix}");
        var ticketTypeId = await CreateTicketTypeAsync(client, organizer, eventId, price: 10000m, quantity: 10);

        var checklist = await SendAsync(client, HttpMethod.Get, $"/api/events/{eventId}/paid-sales", null, organizer, HttpStatusCode.OK);
        Assert.Equal("None", checklist.GetProperty("paidSalesStatus").GetString());
        Assert.True(checklist.GetProperty("isSimulation").GetBoolean());

        var activation = await SendAsync(client, HttpMethod.Post, $"/api/events/{eventId}/paid-sales/activate-simulation",
            new { confirmSimulationOnly = true }, organizer, HttpStatusCode.OK);
        Assert.All(activation.GetProperty("checklist").GetProperty("items").EnumerateArray(),
            item => Assert.True(item.GetProperty("completed").GetBoolean(), item.GetProperty("key").GetString()));

        await SendAsync(client, HttpMethod.Post, $"/api/events/{eventId}/campaigns", new
        {
            code = $"SAVE{suffix}", discountType = "Percentage", discountValue = 10m, maxRedemptions = 5
        }, organizer, HttpStatusCode.Created);

        var quote = await SendAsync(client, HttpMethod.Post, "/api/orders/quote", new
        {
            eventId, items = new[] { new { ticketTypeId, quantity = 2 } }, promoCode = $"save{suffix}"
        }, null, HttpStatusCode.OK);
        Assert.Equal(20000m, quote.GetProperty("subtotal").GetDecimal());
        Assert.Equal(2000m, quote.GetProperty("discountTotal").GetDecimal());

        var badPromo = await SendAsync(client, HttpMethod.Post, "/api/orders/checkout", new
        {
            eventId, attendeeName = "Paid Attendee", attendeeEmail = attendee.Email,
            items = new[] { new { ticketTypeId, quantity = 1 } }, promoCode = "DOES-NOT-EXIST"
        }, attendee, HttpStatusCode.BadRequest);
        Assert.Contains("does not exist", badPromo.GetProperty("error").GetString());

        var order = await SendAsync(client, HttpMethod.Post, "/api/orders/checkout", new
        {
            eventId, attendeeName = "Paid Attendee", attendeeEmail = attendee.Email,
            items = new[] { new { ticketTypeId, quantity = 2 } }, promoCode = $"SAVE{suffix}"
        }, attendee, HttpStatusCode.Created);
        var orderId = order.GetProperty("id").GetGuid();
        Assert.Equal(18000m, order.GetProperty("total").GetDecimal());

        await SendAsync(client, HttpMethod.Post, $"/api/orders/{orderId}/pay", new { outcome = "failed" }, attendee, HttpStatusCode.OK);
        var paid = await SendAsync(client, HttpMethod.Post, $"/api/orders/{orderId}/pay", new { outcome = "succeeded" }, attendee, HttpStatusCode.OK);
        Assert.Equal("Confirmed", paid.GetProperty("status").GetString());
        Assert.True(paid.GetProperty("feeTotal").GetDecimal() > 0);
        var ticketId = paid.GetProperty("items")[0].GetProperty("tickets")[0].GetProperty("id").GetGuid();

        var pdf = await client.SendAsync(Authorized(HttpMethod.Get, $"/api/tickets/{ticketId}/pdf", organizer));
        Assert.Equal(HttpStatusCode.OK, pdf.StatusCode);
        Assert.Equal("application/pdf", pdf.Content.Headers.ContentType?.MediaType);

        var analytics = await SendAsync(client, HttpMethod.Get, $"/api/events/{eventId}/analytics", null, organizer, HttpStatusCode.OK);
        var revenue = analytics.GetProperty("revenue");
        Assert.Equal(20000m, revenue.GetProperty("grossSales").GetDecimal());
        Assert.Equal(2000m, revenue.GetProperty("discounts").GetDecimal());
        Assert.Equal(18000m, revenue.GetProperty("netRevenue").GetDecimal());
        Assert.Equal(2, analytics.GetProperty("capacity").GetProperty("ticketsSold").GetInt32());
        Assert.Equal(2, analytics.GetProperty("campaigns")[0].GetProperty("ticketsSold").GetInt32());

        var refunded = await SendAsync(client, HttpMethod.Post, $"/api/events/{eventId}/orders/{orderId}/refund",
            new { reason = "Customer request" }, organizer, HttpStatusCode.OK);
        Assert.Equal("Refunded", refunded.GetProperty("status").GetString());
        Assert.Equal(18000m, refunded.GetProperty("refundTotal").GetDecimal());
        Assert.All(refunded.GetProperty("items")[0].GetProperty("tickets").EnumerateArray(),
            ticket => Assert.Equal("Refunded", ticket.GetProperty("status").GetString()));

        analytics = await SendAsync(client, HttpMethod.Get, $"/api/events/{eventId}/analytics", null, organizer, HttpStatusCode.OK);
        Assert.Equal(18000m, analytics.GetProperty("revenue").GetProperty("refunds").GetDecimal());
        Assert.Equal(0m, analytics.GetProperty("revenue").GetProperty("netRevenue").GetDecimal());
        Assert.Equal(0, analytics.GetProperty("capacity").GetProperty("ticketsSold").GetInt32());

        var history = await SendAsync(client, HttpMethod.Get, $"/api/events/{eventId}/history", null, organizer, HttpStatusCode.OK);
        var actions = history.EnumerateArray().Select(entry => entry.GetProperty("actionType").GetString()).ToHashSet();
        foreach (var expected in new[] { "EventCreated", "EventPublished", "TicketTypeCreated", "PaidSalesActivated",
                     "ActivationFeePaid", "PromoCampaignCreated", "PaymentFailed", "PaymentSucceeded", "OrderRefunded" })
        {
            Assert.Contains(expected, actions);
        }

        var filtered = await SendAsync(client, HttpMethod.Get, $"/api/events/{eventId}/history?type=OrderRefunded", null, organizer, HttpStatusCode.OK);
        Assert.Equal(1, filtered.GetArrayLength());
        await SendAsync(client, HttpMethod.Get, $"/api/events/{eventId}/history", null, attendee, HttpStatusCode.Forbidden);

        var ics = await client.GetStringAsync($"/api/events/{eventId}/calendar.ics");
        Assert.Contains($"UID:{eventId}@biletflow", ics);
        Assert.Contains("DTSTART;TZID=Asia/Almaty:", ics);
        Assert.Contains("STATUS:CONFIRMED", ics);

        var notifications = await SendAsync(client, HttpMethod.Get, "/api/notifications", null, attendee, HttpStatusCode.OK);
        var types = notifications.EnumerateArray().Select(row => row.GetProperty("type").GetString()).ToHashSet();
        Assert.Contains("PaymentFailed", types);
        Assert.Contains("OrderConfirmed", types);
        Assert.Contains("RefundCompleted", types);
    }

    [TicketingRegressionTests.RequiresTestApiFact]
    public async Task AssignedSeatCannotBeSoldTwiceAndIsPrintedOnTheTicket()
    {
        using var client = factory.CreateClient();
        var suffix = Guid.NewGuid().ToString("N")[..10];
        var organizer = await RegisterAsync(client, $"seat-org-{suffix}@example.test", organizer: true);
        var first = await RegisterAsync(client, $"seat-a-{suffix}@example.test");
        var second = await RegisterAsync(client, $"seat-b-{suffix}@example.test");
        var eventId = await CreateEventAsync(client, organizer, $"Seated {suffix}");
        var vip = await CreateTicketTypeAsync(client, organizer, eventId, price: 0m, quantity: 1, name: "VIP");
        var parterre = await CreateTicketTypeAsync(client, organizer, eventId, price: 0m, quantity: 1, name: "Parterre");

        var venues = await SendAsync(client, HttpMethod.Get, "/api/venues", null, null, HttpStatusCode.OK);
        var venue = venues.EnumerateArray().Single(row => row.GetProperty("name").GetString() == "BiletFlow Demo Hall");
        var sections = venue.GetProperty("sections").EnumerateArray()
            .ToDictionary(row => row.GetProperty("name").GetString()!, row => row.GetProperty("id").GetGuid());
        Assert.True(venue.GetProperty("sections").EnumerateArray().Any(row => row.GetProperty("accessibleSeatCount").GetInt32() > 0));

        var map = await SendAsync(client, HttpMethod.Put, $"/api/events/{eventId}/seating", new
        {
            seatingMode = "Assigned",
            venueId = venue.GetProperty("id").GetGuid(),
            sections = new[]
            {
                new { sectionId = sections["VIP"], ticketTypeId = vip },
                new { sectionId = sections["Parterre"], ticketTypeId = parterre }
            }
        }, organizer, HttpStatusCode.OK);
        var vipSeat = map.GetProperty("sections").EnumerateArray().Single(row => row.GetProperty("name").GetString() == "VIP")
            .GetProperty("seats")[0];
        var seatId = vipSeat.GetProperty("seatId").GetGuid();
        Assert.Equal("Available", vipSeat.GetProperty("status").GetString());
        Assert.Equal("Unavailable", map.GetProperty("sections").EnumerateArray()
            .Single(row => row.GetProperty("name").GetString() == "Balcony").GetProperty("seats")[0].GetProperty("status").GetString());

        await SendAsync(client, HttpMethod.Post, "/api/orders/checkout", new
        {
            eventId, attendeeName = "No Seat", attendeeEmail = first.Email, items = new[] { new { ticketTypeId = vip, quantity = 1 } }
        }, first, HttpStatusCode.BadRequest);

        var order = await SendAsync(client, HttpMethod.Post, "/api/orders/checkout", new
        {
            eventId, attendeeName = "Seat Holder", attendeeEmail = first.Email, seatIds = new[] { seatId }
        }, first, HttpStatusCode.Created);
        var ticket = order.GetProperty("items")[0].GetProperty("tickets")[0];
        Assert.Equal("VIP", ticket.GetProperty("sectionName").GetString());
        Assert.Equal("A", ticket.GetProperty("rowLabel").GetString());
        Assert.Equal("1", ticket.GetProperty("seatNumber").GetString());

        await SendAsync(client, HttpMethod.Post, "/api/orders/checkout", new
        {
            eventId, attendeeName = "Too Late", attendeeEmail = second.Email, seatIds = new[] { seatId }
        }, second, HttpStatusCode.Conflict);

        map = await SendAsync(client, HttpMethod.Get, $"/api/events/{eventId}/seat-map", null, null, HttpStatusCode.OK);
        var soldSeat = map.GetProperty("sections").EnumerateArray().Single(row => row.GetProperty("name").GetString() == "VIP")
            .GetProperty("seats").EnumerateArray().Single(row => row.GetProperty("seatId").GetGuid() == seatId);
        Assert.Equal("Sold", soldSeat.GetProperty("status").GetString());

        var verification = await SendAsync(client, HttpMethod.Post, "/api/verification/validate",
            new { ticketCode = ticket.GetProperty("code").GetString(), eventId }, organizer, HttpStatusCode.OK);
        Assert.Equal("VIP, Row A, Seat 1", verification.GetProperty("seatLabel").GetString());

        await SendAsync(client, HttpMethod.Put, $"/api/events/{eventId}/seating", new { seatingMode = "General" },
            organizer, HttpStatusCode.Conflict);
    }

    [TicketingRegressionTests.RequiresTestApiFact]
    public async Task CancellingAnEventSettlesOrdersAndPublishesACancellationCalendarFile()
    {
        using var client = factory.CreateClient();
        var suffix = Guid.NewGuid().ToString("N")[..10];
        var organizer = await RegisterAsync(client, $"cancel-org-{suffix}@example.test", organizer: true);
        var attendee = await RegisterAsync(client, $"cancel-att-{suffix}@example.test");
        var eventId = await CreateEventAsync(client, organizer, $"Cancelled {suffix}");
        var freeType = await CreateTicketTypeAsync(client, organizer, eventId, price: 0m, quantity: 5, name: "Free");
        var paidType = await CreateTicketTypeAsync(client, organizer, eventId, price: 5000m, quantity: 5, name: "Paid");
        await SendAsync(client, HttpMethod.Post, $"/api/events/{eventId}/paid-sales/activate-simulation",
            new { confirmSimulationOnly = true }, organizer, HttpStatusCode.OK);

        var freeOrder = await SendAsync(client, HttpMethod.Post, "/api/orders/checkout", new
        {
            eventId, attendeeName = "Free", attendeeEmail = attendee.Email, items = new[] { new { ticketTypeId = freeType, quantity = 1 } }
        }, attendee, HttpStatusCode.Created);
        var paidOrder = await SendAsync(client, HttpMethod.Post, "/api/orders/checkout", new
        {
            eventId, attendeeName = "Paid", attendeeEmail = attendee.Email, items = new[] { new { ticketTypeId = paidType, quantity = 1 } }
        }, attendee, HttpStatusCode.Created);
        await SendAsync(client, HttpMethod.Post, $"/api/orders/{paidOrder.GetProperty("id").GetGuid()}/pay",
            new { outcome = "succeeded" }, attendee, HttpStatusCode.OK);

        var cancelled = await SendAsync(client, HttpMethod.Post, $"/api/events/{eventId}/cancel", null, organizer, HttpStatusCode.OK);
        Assert.Equal("Cancelled", cancelled.GetProperty("lifecycleStatus").GetString());

        var orders = await SendAsync(client, HttpMethod.Get, "/api/orders/me", null, attendee, HttpStatusCode.OK);
        var statuses = orders.EnumerateArray().ToDictionary(row => row.GetProperty("id").GetGuid(), row => row.GetProperty("status").GetString());
        Assert.Equal("Cancelled", statuses[freeOrder.GetProperty("id").GetGuid()]);
        Assert.Equal("Refunded", statuses[paidOrder.GetProperty("id").GetGuid()]);

        // Organizers can still open the cancelled event and its history.
        await SendAsync(client, HttpMethod.Get, $"/api/events/{eventId}", null, organizer, HttpStatusCode.OK);
        var cancelledEvents = await SendAsync(client, HttpMethod.Get, "/api/events/me?status=Cancelled", null, organizer, HttpStatusCode.OK);
        Assert.Contains(cancelledEvents.EnumerateArray(), row => row.GetProperty("id").GetGuid() == eventId);

        var ics = await (await client.SendAsync(Authorized(HttpMethod.Get, $"/api/events/{eventId}/calendar.ics", attendee)))
            .Content.ReadAsStringAsync();
        Assert.Contains("METHOD:CANCEL", ics);
        Assert.Contains("STATUS:CANCELLED", ics);

        var duplicate = await SendAsync(client, HttpMethod.Post, $"/api/events/{eventId}/duplicate", null, organizer, HttpStatusCode.Created);
        var copyId = duplicate.GetProperty("id").GetGuid();
        Assert.False(duplicate.GetProperty("isPublished").GetBoolean());
        var copyOrders = await SendAsync(client, HttpMethod.Get, $"/api/events/{copyId}/orders", null, organizer, HttpStatusCode.OK);
        Assert.Equal(0, copyOrders.GetArrayLength());
        var copyTypes = await SendAsync(client, HttpMethod.Get, $"/api/events/{copyId}/ticket-types", null, organizer, HttpStatusCode.OK);
        Assert.All(copyTypes.EnumerateArray(), row => Assert.Equal(0, row.GetProperty("soldQuantity").GetInt32()));
    }

    [TicketingRegressionTests.RequiresTestApiFact]
    public async Task PlatformAdminModeratesReportedEventsAndUsers()
    {
        using var client = factory.CreateClient();
        var suffix = Guid.NewGuid().ToString("N")[..10];
        var admin = await LoginAsync(client, "admin@biletflow.local", "AdminDemo123!");
        var organizer = await RegisterAsync(client, $"mod-org-{suffix}@example.test", organizer: true);
        var attendee = await RegisterAsync(client, $"mod-att-{suffix}@example.test");
        var eventId = await CreateEventAsync(client, organizer, $"Moderated {suffix}");
        var freeType = await CreateTicketTypeAsync(client, organizer, eventId, price: 0m, quantity: 5);

        await SendAsync(client, HttpMethod.Get, "/api/admin/overview", null, organizer, HttpStatusCode.Forbidden);

        var report = await SendAsync(client, HttpMethod.Post, $"/api/events/{eventId}/reports",
            new { reason = "Suspicious event", details = "Looks fake." }, attendee, HttpStatusCode.Created);
        var reported = await SendAsync(client, HttpMethod.Get, "/api/admin/events?status=reported", null, admin, HttpStatusCode.OK);
        Assert.Contains(reported.EnumerateArray(), row => row.GetProperty("id").GetGuid() == eventId);

        await SendAsync(client, HttpMethod.Put, $"/api/admin/reports/{report.GetProperty("id").GetGuid()}",
            new { status = "ActionTaken", note = "Confirmed", suspendEvent = true }, admin, HttpStatusCode.OK);

        await SendAsync(client, HttpMethod.Get, $"/api/events/{eventId}", null, attendee, HttpStatusCode.NotFound);
        var blocked = await SendAsync(client, HttpMethod.Post, "/api/orders/checkout", new
        {
            eventId, attendeeName = "Blocked", attendeeEmail = attendee.Email, items = new[] { new { ticketTypeId = freeType, quantity = 1 } }
        }, attendee, HttpStatusCode.BadRequest);
        Assert.Contains("suspended", blocked.GetProperty("error").GetString());

        await SendAsync(client, HttpMethod.Post, $"/api/admin/events/{eventId}/reinstate", null, admin, HttpStatusCode.OK);
        await SendAsync(client, HttpMethod.Get, $"/api/events/{eventId}", null, attendee, HttpStatusCode.OK);

        var users = await SendAsync(client, HttpMethod.Get, $"/api/admin/users?search=mod-att-{suffix}", null, admin, HttpStatusCode.OK);
        var attendeeId = users[0].GetProperty("id").GetGuid();
        await SendAsync(client, HttpMethod.Post, $"/api/admin/users/{attendeeId}/suspend", new { reason = "Abuse" }, admin, HttpStatusCode.OK);
        using (var me = await client.SendAsync(Authorized(HttpMethod.Get, "/api/orders/me", attendee)))
        {
            Assert.Equal(HttpStatusCode.Unauthorized, me.StatusCode);
        }

        await SendAsync(client, HttpMethod.Post, $"/api/admin/users/{attendeeId}/reinstate", null, admin, HttpStatusCode.OK);

        var settings = await SendAsync(client, HttpMethod.Get, "/api/admin/settings", null, admin, HttpStatusCode.OK);
        Assert.Equal("KZT", settings.GetProperty("currency").GetString());

        using var export = await client.SendAsync(Authorized(HttpMethod.Get, "/api/admin/exports/events", admin));
        Assert.Equal(HttpStatusCode.OK, export.StatusCode);
        Assert.Contains($"Moderated {suffix}", await export.Content.ReadAsStringAsync());
    }

    [TicketingRegressionTests.RequiresTestApiFact]
    public async Task CampaignQrLinkIsNeverAcceptedForAdmission()
    {
        using var client = factory.CreateClient();
        var suffix = Guid.NewGuid().ToString("N")[..10];
        var organizer = await RegisterAsync(client, $"qr-org-{suffix}@example.test", organizer: true);
        var eventId = await CreateEventAsync(client, organizer, $"Campaign QR {suffix}");
        await CreateTicketTypeAsync(client, organizer, eventId, price: 0m, quantity: 5);
        var campaign = await SendAsync(client, HttpMethod.Post, $"/api/events/{eventId}/campaigns", new
        {
            code = $"QR{suffix}", discountType = "FixedKzt", discountValue = 100m
        }, organizer, HttpStatusCode.Created);
        var url = campaign.GetProperty("campaignUrl").GetString()!;

        foreach (var code in new[] { url, url[(url.LastIndexOf('/') + 1)..] })
        {
            var result = await SendAsync(client, HttpMethod.Post, "/api/verification/check-in", new { ticketCode = code },
                organizer, HttpStatusCode.BadRequest);
            Assert.Equal("Invalid", result.GetProperty("result").GetString());
        }
    }

    private sealed record Account(string Email, string AccessToken);

    private static async Task<Account> RegisterAsync(HttpClient client, string email, bool organizer = false)
    {
        var registration = await SendAsync(client, HttpMethod.Post, "/api/auth/register",
            new { email, password = Password, createOrganizerProfile = organizer, fullName = "Test User" }, null, HttpStatusCode.Created);
        await SendAsync(client, HttpMethod.Post, "/api/auth/verify-email",
            new { token = registration.GetProperty("verificationToken").GetString() }, null, HttpStatusCode.OK);
        return await LoginAsync(client, email, Password);
    }

    private static async Task<Account> LoginAsync(HttpClient client, string email, string password)
    {
        var login = await SendAsync(client, HttpMethod.Post, "/api/auth/login", new { email, password }, null, HttpStatusCode.OK);
        return new Account(email, login.GetProperty("accessToken").GetString()!);
    }

    private static async Task<Guid> CreateEventAsync(HttpClient client, Account organizer, string title)
    {
        var ev = await SendAsync(client, HttpMethod.Post, "/api/events", new
        {
            title,
            description = "Integration test event for the finalized BiletFlow backend features.",
            venue = "Integration Hall",
            city = "Almaty",
            venueAddress = "Abay Avenue 1",
            timezone = "Asia/Almaty",
            refundPolicy = "Full refunds until the day before the event.",
            startDateUtc = DateTimeOffset.UtcNow.AddDays(5),
            endDateUtc = DateTimeOffset.UtcNow.AddDays(5).AddHours(3),
            isPublished = true,
            capacity = 100
        }, organizer, HttpStatusCode.Created);
        return ev.GetProperty("id").GetGuid();
    }

    private static async Task<Guid> CreateTicketTypeAsync(
        HttpClient client, Account organizer, Guid eventId, decimal price, int quantity, string name = "Standard")
    {
        var ticketType = await SendAsync(client, HttpMethod.Post, $"/api/events/{eventId}/ticket-types",
            new { name, price, quantity, maxPerOrder = 5 }, organizer, HttpStatusCode.Created);
        return ticketType.GetProperty("id").GetGuid();
    }

    private static HttpRequestMessage Authorized(HttpMethod method, string path, Account account)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", account.AccessToken);
        return request;
    }

    private static async Task<JsonElement> SendAsync(
        HttpClient client, HttpMethod method, string path, object? body, Account? account, HttpStatusCode expectedStatus)
    {
        using var request = new HttpRequestMessage(method, path);
        if (body is not null) request.Content = JsonContent.Create(body, options: JsonOptions);
        if (account is not null) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", account.AccessToken);
        using var response = await client.SendAsync(request);
        var responseBody = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == expectedStatus,
            $"{method} {path} returned {(int)response.StatusCode}: {responseBody}");
        return string.IsNullOrWhiteSpace(responseBody) ? default : JsonDocument.Parse(responseBody).RootElement.Clone();
    }
}
