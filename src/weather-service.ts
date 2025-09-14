export interface WeatherData {
  condition: string;
  temperature: number;
  humidity: number;
  isRaining: boolean;
  description: string;
}

export class WeatherService {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.WEATHER_API_KEY || '';
  }

  async getWeatherForLocation(lat: number, lng: number): Promise<WeatherData> {
    if (!this.apiKey) {
      // Return mock weather data if no API key is provided
      return this.getMockWeather();
    }

    try {
      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${this.apiKey}&units=metric`
      );

      if (!response.ok) {
        throw new Error(`Weather API error: ${response.status}`);
      }

      const data = await response.json();
      
      return {
        condition: this.mapWeatherCondition(data.weather[0].main),
        temperature: Math.round(data.main.temp),
        humidity: data.main.humidity,
        isRaining: this.isRainingCondition(data.weather[0].main),
        description: data.weather[0].description
      };
    } catch (error) {
      console.warn('Weather API failed, using mock data:', error);
      return this.getMockWeather();
    }
  }

  private getMockWeather(): WeatherData {
    const conditions = ['sunny', 'cloudy', 'rainy', 'partly_cloudy'];
    const randomCondition = conditions[Math.floor(Math.random() * conditions.length)];
    
    return {
      condition: randomCondition,
      temperature: Math.floor(Math.random() * 30) + 5, // 5-35°C
      humidity: Math.floor(Math.random() * 60) + 40, // 40-100%
      isRaining: randomCondition === 'rainy',
      description: this.getDescriptionForCondition(randomCondition)
    };
  }

  private mapWeatherCondition(condition: string): string {
    const conditionMap: { [key: string]: string } = {
      'Clear': 'sunny',
      'Clouds': 'cloudy',
      'Rain': 'rainy',
      'Drizzle': 'rainy',
      'Thunderstorm': 'rainy',
      'Snow': 'snowy',
      'Mist': 'cloudy',
      'Fog': 'cloudy'
    };

    return conditionMap[condition] || 'partly_cloudy';
  }

  private isRainingCondition(condition: string): boolean {
    return ['Rain', 'Drizzle', 'Thunderstorm'].includes(condition);
  }

  private getDescriptionForCondition(condition: string): string {
    const descriptions: { [key: string]: string } = {
      'sunny': 'Clear and sunny',
      'cloudy': 'Overcast with clouds',
      'rainy': 'Light rain showers',
      'partly_cloudy': 'Partly cloudy skies',
      'snowy': 'Snow falling'
    };

    return descriptions[condition] || 'Mixed conditions';
  }

  getWeatherBasedRecommendations(weather: WeatherData): string[] {
    const recommendations: string[] = [];

    if (weather.isRaining) {
      recommendations.push('☂️ Umbrella');
      recommendations.push('🧥 Waterproof jacket');
    }

    if (weather.condition === 'sunny' && weather.temperature > 20) {
      recommendations.push('🧴 Sunscreen');
      recommendations.push('🕶️ Sunglasses');
      recommendations.push('💧 Water bottle');
    }

    if (weather.temperature < 10) {
      recommendations.push('🧥 Warm jacket');
      recommendations.push('🧤 Gloves');
    }

    if (weather.condition === 'snowy') {
      recommendations.push('👢 Winter boots');
      recommendations.push('🧣 Scarf');
    }

    return recommendations;
  }
}
