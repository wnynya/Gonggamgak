const int BAUD_RATE = 9600;
const bool SERIAL_TEST_ONLY = false;
const int COL_COUNT = 7;
const int ROW_COUNT = 12;
const int LED_PIN = LED_BUILTIN;
const int SCAN_INTERVAL_MS = 50;
const int SETTLE_US = 500;
const byte FRAME_HEADER_1 = 0xAA;
const byte FRAME_HEADER_2 = 0x55;

const int cols[COL_COUNT] = {2, 3, 4, 5, 6, 7, 8};
const int rows[ROW_COUNT] = {A0, A1, A2, A3, A4, A5, A6, A7, A8, A9, A10, A11};

int values[ROW_COUNT][COL_COUNT];
unsigned long frameCount = 0;

void setup() {
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  Serial.begin(BAUD_RATE);
  delay(1000);

  for (int c = 0; c < COL_COUNT; c++) {
    pinMode(cols[c], OUTPUT);
    digitalWrite(cols[c], LOW);
  }

  for (int r = 0; r < ROW_COUNT; r++) {
    pinMode(rows[r], INPUT);
  }
}

void scanVelostatMatrix() {
  for (int c = 0; c < COL_COUNT; c++) {
    for (int i = 0; i < COL_COUNT; i++) {
      digitalWrite(cols[i], LOW);
    }

    digitalWrite(cols[c], HIGH);
    delayMicroseconds(SETTLE_US);

    for (int r = 0; r < ROW_COUNT; r++) {
      values[r][c] = analogRead(rows[r]);
    }
  }

  for (int i = 0; i < COL_COUNT; i++) {
    digitalWrite(cols[i], LOW);
  }
}

void writeMatrixBinary() {
  Serial.write(FRAME_HEADER_1);
  Serial.write(FRAME_HEADER_2);

  for (int r = 0; r < ROW_COUNT; r++) {
    for (int c = 0; c < COL_COUNT; c++) {
      Serial.write((byte)(values[r][c] >> 2));
    }
  }
}

void loop() {
  if (SERIAL_TEST_ONLY) {
    Serial.print(F("baud-test "));
    Serial.println(frameCount++);
    digitalWrite(LED_PIN, !digitalRead(LED_PIN));
    delay(500);
    return;
  }

  scanVelostatMatrix();
  writeMatrixBinary();

  frameCount++;
  if (frameCount % 10 == 0) {
    digitalWrite(LED_PIN, !digitalRead(LED_PIN));
  }

  delay(SCAN_INTERVAL_MS);
}
