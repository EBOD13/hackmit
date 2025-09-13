import { Quest, ARGuidance } from '../types';

export class LocationService {
  private watchId: number | null = null;
  private currentPosition: { latitude: number; longitude: number } | null = null;

  async getCurrentLocation(): Promise<{ latitude: number; longitude: number }> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by this browser.'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          this.currentPosition = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          };
          resolve(this.currentPosition);
        },
        (error) => {
          reject(error);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000 // 5 minutes
        }
      );
    });
  }

  startLocationTracking(callback: (position: { latitude: number; longitude: number }) => void): void {
    if (!navigator.geolocation) {
      console.error('Geolocation is not supported by this browser.');
      return;
    }

    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        this.currentPosition = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        };
        callback(this.currentPosition);
      },
      (error) => {
        console.error('Location tracking error:', error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000 // 30 seconds
      }
    );
  }

  stopLocationTracking(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000; // Earth's radius in meters
    const dLat = this.toRadians(lat2 - lat1);
    const dLng = this.toRadians(lng2 - lng1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  calculateBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const dLng = this.toRadians(lng2 - lng1);
    const lat1Rad = this.toRadians(lat1);
    const lat2Rad = this.toRadians(lat2);
    
    const y = Math.sin(dLng) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - 
              Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);
    
    let bearing = Math.atan2(y, x);
    bearing = this.toDegrees(bearing);
    bearing = (bearing + 360) % 360;
    
    return bearing;
  }

  generateARGuidance(quest: Quest, userLat: number, userLng: number): ARGuidance | null {
    if (quest.type !== 'location' || !quest.location) {
      return null;
    }

    const distance = this.calculateDistance(
      userLat, userLng,
      quest.location.latitude, quest.location.longitude
    );

    const direction = this.calculateBearing(
      userLat, userLng,
      quest.location.latitude, quest.location.longitude
    );

    let instructions = `Head towards ${quest.location.name}`;
    if (distance < 50) {
      instructions = `You're very close to ${quest.location.name}! Look around for the location.`;
    } else if (distance < 200) {
      instructions = `You're getting close to ${quest.location.name}. Keep going!`;
    } else if (distance < 500) {
      instructions = `You're approaching ${quest.location.name}. Follow the direction.`;
    }

    return {
      questId: quest.id,
      targetLocation: quest.location,
      distance,
      direction,
      instructions
    };
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  private toDegrees(radians: number): number {
    return radians * (180 / Math.PI);
  }

  getCurrentPosition(): { latitude: number; longitude: number } | null {
    return this.currentPosition;
  }
}
