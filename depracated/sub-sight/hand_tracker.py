import cv2
import mediapipe as mp
import asyncio
import websockets
import json
import math

# ── 여기에 컴퓨터 2의 IP 주소를 입력하세요 ──
TARGET = "192.168.197.97:8765"
#TARGET = "localhost:9990/sight"

mp_hands = mp.solutions.hands
mp_draw = mp.solutions.drawing_utils

def calculate_hand_data(landmarks, prev_landmarks):
    cx = sum(lm.x for lm in landmarks) / len(landmarks)
    cy = sum(lm.y for lm in landmarks) / len(landmarks)

    speed = 0.0
    if prev_landmarks:
        prev_cx = sum(lm.x for lm in prev_landmarks) / len(prev_landmarks)
        prev_cy = sum(lm.y for lm in prev_landmarks) / len(prev_landmarks)
        speed = math.sqrt((cx - prev_cx)**2 + (cy - prev_cy)**2) * 100

    finger_tips = [8, 12, 16, 20]
    finger_mids = [6, 10, 14, 18]

    extended_count = 0
    for tip, mid in zip(finger_tips, finger_mids):
        if landmarks[tip].y < landmarks[mid].y:
            extended_count += 1

    if landmarks[4].x > landmarks[3].x:
        extended_count += 1

    openness = extended_count / 5.0

    move_x = cx - (sum(lm.x for lm in prev_landmarks)/len(prev_landmarks) if prev_landmarks else cx)
    move_y = cy - (sum(lm.y for lm in prev_landmarks)/len(prev_landmarks) if prev_landmarks else cy)
    direction = math.atan2(move_y, move_x)

    return {
        "speed": round(min(speed, 5.0), 4),
        "openness": round(openness, 4),
        "direction": round(direction, 4),
        "position_x": round(cx, 4),
        "position_y": round(cy, 4)
    }

async def main():
    cap = cv2.VideoCapture(0)
    prev_landmarks = None

    print(f"컴퓨터 2({TARGET})에 연결 시도 중...")
    print("Unity에서 먼저 Play 버튼을 눌렀는지 확인하세요!")

    async with websockets.connect(f"ws://{TARGET}") as ws:
        print("연결 성공! 카메라에 손을 가져다 대세요.")

        with mp_hands.Hands(
            min_detection_confidence=0.7,
            min_tracking_confidence=0.7,
            max_num_hands=1
        ) as hands:
            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break

                frame = cv2.flip(frame, 1)
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                results = hands.process(rgb)

                if results.multi_hand_landmarks:
                    for hand_lms in results.multi_hand_landmarks:
                        lms = hand_lms.landmark
                        data = calculate_hand_data(lms, prev_landmarks)

                        try:
                            await ws.send(json.dumps(data))
                            print(f"전송: speed={data['speed']:.2f}, openness={data['openness']:.2f}")
                        except Exception as e:
                            print(f"전송 오류: {e}")

                        prev_landmarks = lms
                        mp_draw.draw_landmarks(frame, hand_lms, mp_hands.HAND_CONNECTIONS)

                        cv2.putText(frame, f"Speed: {data['speed']:.2f}", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0,255,0), 2)
                        cv2.putText(frame, f"Open: {data['openness']:.2f}", (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0,255,0), 2)
                else:
                    prev_landmarks = None

                cv2.imshow("Hand Tracking", frame)
                if cv2.waitKey(1) & 0xFF == ord('q'):
                    break

                await asyncio.sleep(0.033)

    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    asyncio.run(main())