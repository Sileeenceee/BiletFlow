namespace BiletFlow.Api.Tests;

public sealed class ApiFactory : IDisposable
{
    public HttpClient CreateClient()
    {
        var baseUrl = Environment.GetEnvironmentVariable("BILETFLOW_TEST_API_BASE_URL")
            ?? throw new InvalidOperationException(
                "Set BILETFLOW_TEST_API_BASE_URL to a Docker API instance connected to a disposable PostgreSQL database.");
        var baseUri = new Uri(baseUrl, UriKind.Absolute);

        // The API redirects HTTP to HTTPS with 307, and HttpClient drops the Authorization header on that redirect,
        // so authenticated calls would fail with a misleading 401. Require the HTTPS address up front instead.
        if (baseUri.Scheme != Uri.UriSchemeHttps)
        {
            throw new InvalidOperationException(
                $"BILETFLOW_TEST_API_BASE_URL must use https (for Docker: https://localhost:6969), got '{baseUrl}'.");
        }

        var handler = new HttpClientHandler
        {
            // The Docker API generates a new self-signed certificate on every container start, so it cannot be
            // trusted once in the OS store. Accept it only for loopback hosts; any remote host is validated normally.
            ServerCertificateCustomValidationCallback = (request, _, _, errors) =>
                errors == System.Net.Security.SslPolicyErrors.None || request.RequestUri?.IsLoopback == true
        };
        return new HttpClient(handler) { BaseAddress = baseUri };
    }

    public void Dispose() { }
}
