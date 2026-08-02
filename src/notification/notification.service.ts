import { Injectable } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { NotificationDto } from './dto/notification.dto';
import * as firebaseAccount from './firebaseServiceAccount.json';

// FCM allows at most 500 tokens per multicast request.
const MULTICAST_CHUNK = 500;
// Error codes that mean the token is dead and should be pruned.
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

export interface BulkSendResult {
  successCount: number;
  failureCount: number;
  invalidTokens: string[];
}

@Injectable()
export class FirebaseNotificationService {
  onModuleInit() {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(
          firebaseAccount as admin.ServiceAccount,
        ),
      });
    }
  }

  // Shared notification/android/apns payload so single + bulk sends behave identically.
  private buildBase(payload: NotificationDto): Record<string, any> {
    const { title, body, data } = payload;
    return {
      notification: { title, body },
      data: data || {},
      // Android: heads-up, max priority, default sound
      android: {
        priority: 'high' as any,
        notification: {
          priority: 'max' as any,
          defaultSound: true as any,
          visibility: 'public' as any,
          channelId: '1' as any,
          notificationPriority: 'PRIORITY_MAX' as any,
        },
        ttl: 3600 * 1000, // 1 hour TTL
      },
      // iOS
      apns: {
        headers: {
          'apns-priority': '10',
          'apns-push-type': 'alert',
        },
        payload: {
          aps: {
            alert: { title, body },
            sound: 'default',
          },
        },
      },
    };
  }

  async sendNotification(
    token: string,
    payload: NotificationDto,
  ): Promise<string | null> {
    try {
      const message: any = { token, ...this.buildBase(payload) };
      const response = await admin.messaging().send(message);
      return response;
    } catch (error) {
      // A failed push (e.g. stale/unregistered token) is expected and must never
      // crash the listener or abort downstream work like portfolio sync. Log and move on.
      console.error('Error sending FCM notification:', error);
      return null;
    }
  }

  // Fan out one payload to many tokens, chunked at FCM's 500-per-request limit.
  // Returns aggregate counts plus the tokens FCM rejected as dead (safe to prune).
  async sendMulticast(
    tokens: string[],
    payload: NotificationDto,
  ): Promise<BulkSendResult> {
    const result: BulkSendResult = {
      successCount: 0,
      failureCount: 0,
      invalidTokens: [],
    };
    const base = this.buildBase(payload);

    for (let i = 0; i < tokens.length; i += MULTICAST_CHUNK) {
      const batch = tokens.slice(i, i + MULTICAST_CHUNK);
      try {
        const res = await admin
          .messaging()
          .sendEachForMulticast({ tokens: batch, ...base });
        result.successCount += res.successCount;
        result.failureCount += res.failureCount;
        res.responses.forEach((r, idx) => {
          if (!r.success && r.error && DEAD_TOKEN_CODES.has(r.error.code)) {
            result.invalidTokens.push(batch[idx]);
          }
        });
      } catch (error) {
        // Whole-batch failure (network/credential). Count it and keep going.
        console.error('Error sending FCM multicast batch:', error);
        result.failureCount += batch.length;
      }
    }
    return result;
  }
}
