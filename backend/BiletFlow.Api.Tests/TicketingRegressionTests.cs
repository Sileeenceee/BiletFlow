using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using BiletFlow.Api.Models;
using Xunit;

namespace BiletFlow.Api.Tests;

public sealed class TicketingRegressionTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    [RequiresTestApiFact]
    public async Task UpdatingPendingOrderThenPayingPersistsReplacementItemsAndTickets()
    {
        using var client = factory.CreateClient();
        var suffix = Guid.NewGuid().ToString("N");
        var organizer = await RegisterAsync(client, $"organizer-{suffix}@example.test", createOrganizerProfile: true);
        var attendee = await RegisterAsync(client, $"attendee-{suffix}@example.test");
        var eventId = await CreateEventAsync(client, organizer.AccessToken, suffix);
        var ticketTypeId = await CreateTicketTypeAsync(client, organizer.AccessToken, eventId);
        await ActivatePaidSalesAsync(client, organizer.AccessToken, eventId);

        var order = await PostAsync(client, "/api/orders/checkout", new
        {
            eventId,
            attendeeName = "Regression Attendee",
            attendeeEmail = attendee.Email,
            items = new[] { new { ticketTypeId, quantity = 1 } }
        }, attendee.AccessToken, HttpStatusCode.Created);
        var orderId = order.GetProperty("id").GetGuid();

        var updatedOrder = await PutAsync(client, $"/api/orders/{orderId}", new
        {
            attendeeName = "Updated Regression Attendee",
            attendeeEmail = attendee.Email,
            items = new[] { new { ticketTypeId, quantity = 2 } }
        }, attendee.AccessToken, HttpStatusCode.OK);
        Assert.Equal(2, updatedOrder.GetProperty("items")[0].GetProperty("quantity").GetInt32());

        var paidOrder = await PostAsync(client, $"/api/orders/{orderId}/pay", new { outcome = "succeeded" },
            attendee.AccessToken, HttpStatusCode.OK);
        var tickets = paidOrder.GetProperty("items")[0].GetProperty("tickets");
        Assert.Equal(2, tickets.GetArrayLength());
        Assert.All(tickets.EnumerateArray(), ticket =>
            Assert.StartsWith("TKT_", ticket.GetProperty("code").GetString(), StringComparison.Ordinal));
    }

    public sealed class RequiresTestApiFactAttribute : FactAttribute
    {
        public RequiresTestApiFactAttribute()
        {
            if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("BILETFLOW_TEST_API_BASE_URL")))
            {
                Skip = "Set BILETFLOW_TEST_API_BASE_URL to run Docker API integration regressions.";
            }
        }
    }

    [Fact]
    public void TicketPriceRangeValidationUsesInvariantDecimalBounds()
    {
        var previousCulture = CultureInfo.CurrentCulture;
        var previousUiCulture = CultureInfo.CurrentUICulture;
        try
        {
            CultureInfo.CurrentCulture = CultureInfo.GetCultureInfo("fr-FR");
            CultureInfo.CurrentUICulture = CultureInfo.GetCultureInfo("fr-FR");

            var request = new CreateTicketTypeRequest
            {
                Name = "Culture-independent price",
                Price = 1250.50m,
                Quantity = 3
            };

            var validationResults = new List<System.ComponentModel.DataAnnotations.ValidationResult>();
            var isValid = System.ComponentModel.DataAnnotations.Validator.TryValidateObject(
                request,
                new System.ComponentModel.DataAnnotations.ValidationContext(request),
                validationResults,
                validateAllProperties: true);

            Assert.True(isValid, string.Join("; ", validationResults.Select(result => result.ErrorMessage)));
        }
        finally
        {
            CultureInfo.CurrentCulture = previousCulture;
            CultureInfo.CurrentUICulture = previousUiCulture;
        }
    }

    private static async Task<(string Email, string AccessToken)> RegisterAsync(
        HttpClient client, string email, bool createOrganizerProfile = false)
    {
        using var registerResponse = await client.PostAsJsonAsync("/api/auth/register", new
        {
            email,
            password = "TestPassword123!",
            createOrganizerProfile
        }, JsonOptions);
        Assert.Equal(HttpStatusCode.Created, registerResponse.StatusCode);
        using var registration = JsonDocument.Parse(await registerResponse.Content.ReadAsStringAsync());
        var verificationToken = registration.RootElement.GetProperty("verificationToken").GetString();
        Assert.False(string.IsNullOrWhiteSpace(verificationToken));

        using var verifyResponse = await client.PostAsJsonAsync("/api/auth/verify-email",
            new { token = verificationToken }, JsonOptions);
        Assert.Equal(HttpStatusCode.OK, verifyResponse.StatusCode);

        using var loginResponse = await client.PostAsJsonAsync("/api/auth/login",
            new { email, password = "TestPassword123!" }, JsonOptions);
        Assert.Equal(HttpStatusCode.OK, loginResponse.StatusCode);
        using var login = JsonDocument.Parse(await loginResponse.Content.ReadAsStringAsync());
        return (email, login.RootElement.GetProperty("accessToken").GetString()!);
    }

    private static async Task<Guid> CreateEventAsync(HttpClient client, string token, string suffix)
    {
        var eventResponse = await PostAsync(client, "/api/events", new
        {
            title = $"Ticketing regression {suffix}",
            description = "Regression test for pending-order updates and payment ticket issuance.",
            venue = "Integration Test Hall",
            city = "Almaty",
            startDateUtc = DateTimeOffset.UtcNow.AddDays(2),
            endDateUtc = DateTimeOffset.UtcNow.AddDays(3),
            isPublished = true,
            capacity = 20
        }, token, HttpStatusCode.Created);
        return eventResponse.GetProperty("id").GetGuid();
    }

    private static async Task<Guid> CreateTicketTypeAsync(HttpClient client, string token, Guid eventId)
    {
        var response = await PostAsync(client, $"/api/events/{eventId}/ticket-types", new
        {
            name = "Regression ticket",
            price = 1250.50m,
            quantity = 10,
            maxPerOrder = 5
        }, token, HttpStatusCode.Created);
        return response.GetProperty("id").GetGuid();
    }

    private static async Task ActivatePaidSalesAsync(HttpClient client, string token, Guid eventId)
    {
        await PostAsync(client, $"/api/events/{eventId}/paid-sales/activate-simulation",
            new { confirmSimulationOnly = true }, token, HttpStatusCode.OK);
    }

    private static Task<JsonElement> PostAsync(
        HttpClient client, string path, object body, string token, HttpStatusCode expectedStatus) =>
        SendJsonAsync(client, HttpMethod.Post, path, body, token, expectedStatus);

    private static Task<JsonElement> PutAsync(
        HttpClient client, string path, object body, string token, HttpStatusCode expectedStatus) =>
        SendJsonAsync(client, HttpMethod.Put, path, body, token, expectedStatus);

    private static async Task<JsonElement> SendJsonAsync(
        HttpClient client, HttpMethod method, string path, object body, string token, HttpStatusCode expectedStatus)
    {
        using var request = new HttpRequestMessage(method, path)
        {
            Content = JsonContent.Create(body, options: JsonOptions)
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var response = await client.SendAsync(request);
        var responseBody = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == expectedStatus,
            $"{method} {path} returned {(int)response.StatusCode}: {responseBody}");
        return string.IsNullOrWhiteSpace(responseBody)
            ? default
            : JsonDocument.Parse(responseBody).RootElement.Clone();
    }
}
