import SockJS from "sockjs-client";
import { Client, StompSubscription } from "@stomp/stompjs";

export interface ChatMessage {
  id?: string;
  senderId: string | number; // 백엔드에서 number로 오고, 프론트에서 비교할 때 타입 혼동 방지
  senderName: string;
  content: string;
  timestamp: string;
  roomId: number;
  chatRoomId?: number; // WebSocket에서 사용하는 추가 속성
  senderEmail: string;
  messageType?: string; // 메시지 타입 추가 (일반, 나가기 알림 등)
}

export interface ChatRoom {
  id: number;
  name: string;
  participants: string[];
  lastMessage?: ChatMessage;
}

class WebSocketService {
  private client: Client | null = null;
  private subscriptions: Map<number, StompSubscription> = new Map();
  private globalMessageSubscription: StompSubscription | null = null; // 전역 메시지 구독
  private messageHandlers: Map<number, (message: ChatMessage) => void> =
    new Map(); // 채팅방별 메시지 핸들러
  private isConnected: boolean = false;

  // WebSocket 연결
  public connect(userEmail: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        console.log("WebSocket 연결 시도...");

        this.client = new Client({
          webSocketFactory: () => new SockJS("http://localhost:8080/chat"),
          connectHeaders: {
            "user-email": userEmail,
          },
          debug: (str: string) => {
            // STOMP 디버그 로그 (중요한 것만 필터링)
            if (
              str.includes("SEND") ||
              str.includes("MESSAGE") ||
              str.includes("SUBSCRIBE") ||
              str.includes("ERROR")
            ) {
              console.log("🔍 [STOMP Debug]:", str);
            }
          },
          reconnectDelay: 0,
          heartbeatIncoming: 4000,
          heartbeatOutgoing: 4000,
        });

        this.client.onConnect = () => {
          console.log("WebSocket 연결 성공");
          this.isConnected = true;
          resolve();
        };

        this.client.onStompError = (frame) => {
          console.error("STOMP 에러:", frame);
          reject(new Error(frame.headers.message || "STOMP 연결 에러"));
        };

        this.client.onWebSocketError = (error) => {
          console.error("WebSocket 에러:", error);
          reject(error);
        };

        this.client.onWebSocketClose = () => {
          console.log("WebSocket 연결 종료");
          this.isConnected = false;
          this.subscriptions.clear();
        };

        this.client.activate();
      } catch (error) {
        console.error("WebSocket 연결 중 에러:", error);
        reject(error);
      }
    });
  }

  // 연결 해제
  public disconnect(): void {
    console.log("=== WebSocket 연결 해제 시작 ===");
    console.log("현재 구독 중인 채팅방 수:", this.subscriptions.size);

    if (this.client) {
      // 전역 구독 해제
      if (this.globalMessageSubscription) {
        this.globalMessageSubscription.unsubscribe();
        this.globalMessageSubscription = null;
      }

      this.subscriptions.clear();
      this.messageHandlers.clear();
      console.log("모든 구독 해제 완료");

      this.client.deactivate();
      this.client = null;
      this.isConnected = false;
      console.log("WebSocket 클라이언트 해제 완료");
    }
  }

  // 채팅방 구독
  public subscribeToChatRoom(
    roomId: number,
    onMessage: (message: ChatMessage) => void
  ): void {
    console.log(`=== 채팅방 ${roomId} 구독 시도 ===`);

    if (!this.client || !this.isConnected) {
      console.error("WebSocket이 연결되지 않았습니다.");
      return;
    }

    // 메시지 핸들러 등록
    this.messageHandlers.set(roomId, onMessage);
    console.log(`채팅방 ${roomId} 메시지 핸들러 등록 완료`);

    // 전역 구독이 없으면 생성 (백엔드는 /sub/receiveMessage로 모든 메시지를 브로드캐스트)
    if (!this.globalMessageSubscription) {
      console.log("전역 메시지 구독 생성: /sub/receiveMessage");
      this.globalMessageSubscription = this.client.subscribe(
        `/sub/receiveMessage`,
        (message) => {
          console.log(`📨 [전역 구독] 원시 메시지 수신:`, {
            destination: message.headers.destination,
            body: message.body,
          });

          try {
            const chatMessage: ChatMessage = JSON.parse(message.body);
            const messageRoomId = chatMessage.roomId || chatMessage.chatRoomId;

            console.log(
              `✅ 파싱된 메시지 - roomId: ${messageRoomId}`,
              chatMessage
            );

            // 해당 채팅방의 핸들러가 있으면 호출
            if (messageRoomId) {
              const handler = this.messageHandlers.get(Number(messageRoomId));
              if (handler) {
                console.log(`채팅방 ${messageRoomId} 핸들러 호출`);
                handler(chatMessage);
              } else {
                console.log(
                  `채팅방 ${messageRoomId}에 대한 핸들러가 없습니다. 등록된 핸들러:`,
                  Array.from(this.messageHandlers.keys())
                );
              }
            } else {
              console.warn("메시지에 roomId가 없습니다:", chatMessage);
            }
          } catch (error) {
            console.error("❌ 메시지 파싱 에러:", error);
            console.error("원본 메시지 body:", message.body);
          }
        }
      );
      console.log("✅ 전역 메시지 구독 완료");
    }

    // 기존 구독 방식과의 호환성을 위해 subscriptions에도 등록 (실제로는 사용하지 않음)
    this.subscriptions.set(roomId, this.globalMessageSubscription);
    console.log(
      `✅ 채팅방 ${roomId} 구독 완료, 총 핸들러 수: ${this.messageHandlers.size}`
    );

    // 현재 등록된 채팅방 목록 출력
    console.log(
      "현재 등록된 채팅방 핸들러들:",
      Array.from(this.messageHandlers.keys())
    );
  }

  // 채팅방 구독 해제
  public unsubscribeFromChatRoom(roomId: number): void {
    // 메시지 핸들러 제거
    this.messageHandlers.delete(roomId);
    this.subscriptions.delete(roomId);
    console.log(`채팅방 ${roomId} 구독 해제`);

    // 모든 핸들러가 제거되면 전역 구독도 해제
    if (this.messageHandlers.size === 0 && this.globalMessageSubscription) {
      console.log("모든 핸들러 제거됨 - 전역 구독 해제");
      this.globalMessageSubscription.unsubscribe();
      this.globalMessageSubscription = null;
    }
  }

  // 메시지 전송
  public sendMessage(
    roomId: number,
    message: Omit<ChatMessage, "id" | "timestamp">
  ): void {
    console.log("=== WebSocket sendMessage 호출 ===");
    console.log("client 상태:", this.client);
    console.log("isConnected:", this.isConnected);
    console.log("client?.active:", this.client?.active);
    console.log("roomId:", roomId);
    console.log("message:", message);

    if (!this.client) {
      console.error("❌ WebSocket 클라이언트가 없습니다.");
      throw new Error("WebSocket 클라이언트가 초기화되지 않았습니다.");
    }

    if (!this.isConnected) {
      console.error("❌ WebSocket이 연결되지 않았습니다.");
      throw new Error(
        "WebSocket이 연결되지 않았습니다. 먼저 연결을 시도해주세요."
      );
    }

    if (!this.client.active) {
      console.error("❌ STOMP 클라이언트가 활성화되지 않았습니다.");
      throw new Error("STOMP 클라이언트가 활성화되지 않았습니다.");
    }

    // 백엔드 MessageDto 형식에 맞춰서 전송
    const messageDto = {
      senderId: Number(message.senderId),
      senderName: message.senderName,
      senderEmail: message.senderEmail,
      content: message.content,
      chatRoomId: roomId,
    };

    console.log("전송할 messageDto:", messageDto);
    console.log("destination:", `/pub/receiveMessage`); // 백엔드 @MessageMapping("/receiveMessage")

    try {
      const result = this.client.publish({
        destination: `/pub/receiveMessage`, // 백엔드 @MessageMapping("/receiveMessage")
        body: JSON.stringify(messageDto),
      });

      console.log("✅ 메시지 전송 완료:", messageDto);
      console.log("publish 결과:", result);
    } catch (error) {
      console.error("❌ 메시지 전송 중 에러:", error);
      throw error;
    }
  }

  // 연결 상태 확인
  public isWebSocketConnected(): boolean {
    return this.isConnected;
  }

  // 구독 상태 확인 (디버깅용)
  public getSubscriptions(): Map<number, StompSubscription> {
    return this.subscriptions;
  }

  // 구독된 채팅방 목록 확인 (디버깅용)
  public getSubscribedRoomIds(): number[] {
    return Array.from(this.subscriptions.keys());
  }
}

// 싱글톤 인스턴스 생성
export const webSocketService = new WebSocketService();
export default webSocketService;
