namespace PlanetLab.Api.Models;

public class Planet
{
    public int Id { get; set; }

    public string Name { get; set; } = "Unnamed Planet";

    public double Temperature { get; set; }

    public double Gravity { get; set; }

    public double Atmosphere { get; set; }

    public double Water { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}