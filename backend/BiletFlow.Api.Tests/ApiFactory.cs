namespace BiletFlow.Api.Tests;

public sealed class ApiFactory : IDisposable
{
    public HttpClient CreateClient()
    {
        var baseUrl = Environment.GetEnvironmentVariable("BILETFLOW_TEST_API_BASE_URL")
            ?? throw new InvalidOperationException(
                "Set BILETFLOW_TEST_API_BASE_URL to a Docker API instance connected to a disposable PostgreSQL database.");
        return new HttpClient { BaseAddress = new Uri(baseUrl, UriKind.Absolute) };
    }

    public void Dispose() { }
}
