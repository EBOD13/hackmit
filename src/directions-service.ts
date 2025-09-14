import { Client, DirectionsRequest, DirectionsResponse, TravelMode } from '@googlemaps/google-maps-services-js';

export interface DirectionStep {
  instruction: string;
  distance: string;
  duration: string;
}

export interface WalkingDirections {
  steps: DirectionStep[];
  totalDistance: string;
  totalDuration: string;
}

export class DirectionsService {
  private client: Client;
  private apiKey: string;

  constructor(apiKey: string) {
    this.client = new Client({});
    this.apiKey = apiKey;
  }

  /**
   * Get walking directions from origin to destination
   */
  async getWalkingDirections(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number
  ): Promise<WalkingDirections | null> {
    try {
      const request: DirectionsRequest = {
        params: {
          origin: `${originLat},${originLng}`,
          destination: `${destLat},${destLng}`,
          mode: TravelMode.walking,
          key: this.apiKey,
        },
      };

      const response = await this.client.directions(request);

      if (response.data.status !== 'OK' || !response.data.routes[0]) {
        console.warn('No walking directions found');
        return null;
      }

      const route = response.data.routes[0];
      const leg = route.legs[0]; // Single leg for origin to destination

      if (!leg) {
        return null;
      }

      // Extract turn-by-turn steps
      const steps: DirectionStep[] = leg.steps.map(step => ({
        instruction: this.cleanHtmlInstructions(step.html_instructions || ''),
        distance: step.distance?.text || '',
        duration: step.duration?.text || ''
      }));

      return {
        steps,
        totalDistance: leg.distance?.text || '',
        totalDuration: leg.duration?.text || ''
      };

    } catch (error) {
      console.warn('Failed to get walking directions:', error);
      return null;
    }
  }

  /**
   * Get the first two most important direction steps for display on glasses
   */
  getNextTwoSteps(directions: WalkingDirections): string[] {
    if (!directions.steps || directions.steps.length === 0) {
      return [];
    }

    // Return first two steps, or all steps if less than 2
    const nextSteps = directions.steps.slice(0, 2);
    return nextSteps.map(step => `${step.instruction} (${step.distance})`);
  }

  /**
   * Clean HTML tags from Google's instruction text
   */
  private cleanHtmlInstructions(html: string): string {
    return html
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&nbsp;/g, ' ') // Replace non-breaking spaces
      .replace(/&amp;/g, '&') // Replace HTML entities
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();
  }

  /**
   * Format directions for webview display
   */
  formatDirectionsForWebview(directions: WalkingDirections): string {
    let formatted = `🚶 Walking directions (${directions.totalDuration}, ${directions.totalDistance}):\n\n`;

    directions.steps.forEach((step, index) => {
      formatted += `${index + 1}. ${step.instruction}\n`;
      formatted += `   ${step.distance} • ${step.duration}\n\n`;
    });

    return formatted.trim();
  }
}