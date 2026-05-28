const int BAUD_RATE = 115200;
const int COL_COUNT = 2;
const int ROW_COUNT = 2;

const int cols[COL_COUNT] = {2, 3};
const int rows[ROW_COUNT] = {A0, A1};

int values[ROW_COUNT][COL_COUNT];

void setup() {
  Serial.begin(BAUD_RATE);

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
    delayMicroseconds(500);

    for (int r = 0; r < ROW_COUNT; r++) {
      values[r][c] = analogRead(rows[r]);
    }
  }

  for (int i = 0; i < COL_COUNT; i++) {
    digitalWrite(cols[i], LOW);
  }
}

void printMatrixJson() {
  Serial.print("{\"rows\":");
  Serial.print(ROW_COUNT);
  Serial.print(",\"cols\":");
  Serial.print(COL_COUNT);
  Serial.print(",\"values\":[");

  for (int r = 0; r < ROW_COUNT; r++) {
    if (r > 0) {
      Serial.print(",");
    }

    Serial.print("[");
    for (int c = 0; c < COL_COUNT; c++) {
      if (c > 0) {
        Serial.print(",");
      }

      Serial.print(values[r][c]);
    }
    Serial.print("]");
  }

  Serial.println("]}");
}

void loop() {
  scanVelostatMatrix();
  printMatrixJson();
  delay(30);
}
