const byte DIGIT_PINS[] = {2, 3, 4, 5};
const byte SEGMENT_PINS[] = {6, 7, 8, 9, 10, 11, 12};
const byte LED_CONTROL_PIN = 13;
const byte DOOR_INPUT_PIN = A5;

const byte DIGIT_COUNT = 4;
const byte SEGMENT_COUNT = 7;
const byte MAX_MESSAGE_CELLS = 48;

const byte DIGIT_ON = HIGH;
const byte DIGIT_OFF = LOW;
const byte SEGMENT_ON = LOW;
const byte SEGMENT_OFF = HIGH;

const unsigned long SLIDE_INTERVAL_MS = 450;
const unsigned int DIGIT_HOLD_US = 700;
const unsigned int HUMIDIFIER_PULSE_ON_MS = 120;
const unsigned int HUMIDIFIER_PULSE_GAP_MS = 500;

enum SegmentBit {
  SEG_TOP = 1 << 0,
  SEG_UPPER_RIGHT = 1 << 1,
  SEG_LOWER_RIGHT = 1 << 2,
  SEG_BOTTOM = 1 << 3,
  SEG_LOWER_LEFT = 1 << 4,
  SEG_UPPER_LEFT = 1 << 5,
  SEG_MIDDLE = 1 << 6
};

byte messageCells[MAX_MESSAGE_CELLS];
byte messageCellCount = 0;
byte visibleCells[DIGIT_COUNT] = {0, 0, 0, 0};

bool readingDisplayCommand = false;
bool waitingCommandOpen = false;
char pendingCommand[3] = "";
char activeCommand[3] = "";
byte pendingCommandLength = 0;
char commandBuffer[9];
byte commandLength = 0;
byte slideIndex = 0;
byte scanDigit = 0;
int lastDoorState = LOW;
unsigned long lastSlideAt = 0;

struct PulseOutput {
  byte pin;
  byte remainingPulses;
  bool pulseOn;
  unsigned long lastChangeAt;
};

PulseOutput humidifiers[] = {
  {A0, 0, false, 0},
  {A1, 0, false, 0},
};

byte glyphFor(char c) {
  if (c >= 'A' && c <= 'Z') {
    c += 'a' - 'A';
  }

  switch (c) {
    case '0': return SEG_TOP | SEG_UPPER_RIGHT | SEG_LOWER_RIGHT | SEG_BOTTOM | SEG_LOWER_LEFT | SEG_UPPER_LEFT;
    case '1': return SEG_UPPER_RIGHT | SEG_LOWER_RIGHT;
    case '2': return SEG_TOP | SEG_UPPER_RIGHT | SEG_MIDDLE | SEG_LOWER_LEFT | SEG_BOTTOM;
    case '3': return SEG_TOP | SEG_UPPER_RIGHT | SEG_LOWER_RIGHT | SEG_BOTTOM | SEG_MIDDLE;
    case '4': return SEG_UPPER_LEFT | SEG_MIDDLE | SEG_UPPER_RIGHT | SEG_LOWER_RIGHT;
    case '5': return SEG_TOP | SEG_UPPER_LEFT | SEG_MIDDLE | SEG_LOWER_RIGHT | SEG_BOTTOM;
    case '6': return SEG_TOP | SEG_UPPER_LEFT | SEG_LOWER_LEFT | SEG_BOTTOM | SEG_LOWER_RIGHT | SEG_MIDDLE;
    case '7': return SEG_TOP | SEG_UPPER_RIGHT | SEG_LOWER_RIGHT;
    case '8': return SEG_TOP | SEG_UPPER_RIGHT | SEG_LOWER_RIGHT | SEG_BOTTOM | SEG_LOWER_LEFT | SEG_UPPER_LEFT | SEG_MIDDLE;
    case '9': return SEG_TOP | SEG_UPPER_RIGHT | SEG_LOWER_RIGHT | SEG_BOTTOM | SEG_UPPER_LEFT | SEG_MIDDLE;

    case 'a': return SEG_TOP | SEG_UPPER_RIGHT | SEG_LOWER_RIGHT | SEG_LOWER_LEFT | SEG_UPPER_LEFT | SEG_MIDDLE;
    case 'b': return SEG_UPPER_LEFT | SEG_LOWER_LEFT | SEG_BOTTOM | SEG_LOWER_RIGHT | SEG_MIDDLE;
    case 'c': return SEG_MIDDLE | SEG_LOWER_LEFT | SEG_BOTTOM;
    case 'd': return SEG_UPPER_RIGHT | SEG_LOWER_RIGHT | SEG_LOWER_LEFT | SEG_BOTTOM | SEG_MIDDLE;
    case 'e': return SEG_TOP | SEG_UPPER_LEFT | SEG_LOWER_LEFT | SEG_BOTTOM | SEG_MIDDLE;
    case 'f': return SEG_TOP | SEG_UPPER_LEFT | SEG_LOWER_LEFT | SEG_MIDDLE;
    case 'g': return SEG_TOP | SEG_UPPER_LEFT | SEG_LOWER_RIGHT | SEG_BOTTOM | SEG_MIDDLE;
    case 'h': return SEG_UPPER_LEFT | SEG_LOWER_LEFT | SEG_LOWER_RIGHT | SEG_MIDDLE;
    case 'i': return SEG_LOWER_RIGHT;
    case 'j': return SEG_UPPER_RIGHT | SEG_LOWER_RIGHT | SEG_BOTTOM;
    case 'k': return SEG_UPPER_LEFT | SEG_LOWER_LEFT | SEG_MIDDLE | SEG_LOWER_RIGHT;
    case 'l': return SEG_UPPER_LEFT | SEG_LOWER_LEFT | SEG_BOTTOM;
    case 'n': return SEG_LOWER_LEFT | SEG_LOWER_RIGHT | SEG_MIDDLE;
    case 'o': return SEG_LOWER_LEFT | SEG_LOWER_RIGHT | SEG_BOTTOM | SEG_MIDDLE;
    case 'p': return SEG_TOP | SEG_UPPER_RIGHT | SEG_UPPER_LEFT | SEG_LOWER_LEFT | SEG_MIDDLE;
    case 'q': return SEG_TOP | SEG_UPPER_RIGHT | SEG_LOWER_RIGHT | SEG_UPPER_LEFT | SEG_MIDDLE;
    case 'r': return SEG_LOWER_LEFT | SEG_MIDDLE;
    case 's': return SEG_TOP | SEG_UPPER_LEFT | SEG_MIDDLE | SEG_LOWER_RIGHT | SEG_BOTTOM;
    case 't': return SEG_UPPER_LEFT | SEG_LOWER_LEFT | SEG_BOTTOM | SEG_MIDDLE;
    case 'u': return SEG_UPPER_LEFT | SEG_LOWER_LEFT | SEG_LOWER_RIGHT | SEG_BOTTOM;
    case 'v': return SEG_LOWER_LEFT | SEG_LOWER_RIGHT | SEG_BOTTOM;
    case 'x': return SEG_UPPER_LEFT | SEG_UPPER_RIGHT | SEG_LOWER_LEFT | SEG_LOWER_RIGHT | SEG_MIDDLE;
    case 'y': return SEG_UPPER_LEFT | SEG_UPPER_RIGHT | SEG_LOWER_RIGHT | SEG_BOTTOM | SEG_MIDDLE;
    case 'z': return SEG_TOP | SEG_UPPER_RIGHT | SEG_MIDDLE | SEG_LOWER_LEFT | SEG_BOTTOM;
    default: return 0;
  }
}

void clearMessage() {
  messageCellCount = 0;
  slideIndex = 0;
  lastSlideAt = millis();
}

void appendCell(byte glyph) {
  if (messageCellCount < MAX_MESSAGE_CELLS) {
    messageCells[messageCellCount++] = glyph;
  }
}

void appendDisplayChar(char c) {
  if (c >= 'A' && c <= 'Z') {
    c += 'a' - 'A';
  }

  if (c == 'm') {
    appendCell(SEG_UPPER_LEFT | SEG_LOWER_LEFT | SEG_TOP | SEG_UPPER_RIGHT);
    appendCell(SEG_UPPER_RIGHT | SEG_LOWER_RIGHT | SEG_TOP);
  } else if (c == 'w') {
    appendCell(SEG_UPPER_LEFT | SEG_LOWER_LEFT | SEG_BOTTOM | SEG_LOWER_RIGHT);
    appendCell(SEG_UPPER_RIGHT | SEG_LOWER_RIGHT | SEG_BOTTOM);
  } else {
    appendCell(glyphFor(c));
  }
}

bool isDisplayChar(char c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == ' ';
}

int hexValue(char c) {
  if (c >= '0' && c <= '9') {
    return c - '0';
  }
  if (c >= 'a' && c <= 'f') {
    return c - 'a' + 10;
  }
  if (c >= 'A' && c <= 'F') {
    return c - 'A' + 10;
  }
  return -1;
}

bool applyRawDisplayCommand() {
  if (commandLength != 8) {
    return false;
  }

  for (byte i = 0; i < DIGIT_COUNT; i++) {
    int high = hexValue(commandBuffer[i * 2]);
    int low = hexValue(commandBuffer[i * 2 + 1]);

    if (high < 0 || low < 0) {
      return false;
    }

    visibleCells[i] = ((high << 4) | low) & 0x7f;
  }

  messageCellCount = DIGIT_COUNT;
  slideIndex = 0;
  for (byte i = 0; i < DIGIT_COUNT; i++) {
    messageCells[i] = visibleCells[i];
  }
  return true;
}

void clearCommandBuffer() {
  commandLength = 0;
  commandBuffer[0] = '\0';
}

void appendCommandChar(char c) {
  if (c >= 'A' && c <= 'Z') {
    c += 'a' - 'A';
  }

  if (commandLength < sizeof(commandBuffer) - 1) {
    commandBuffer[commandLength++] = c;
    commandBuffer[commandLength] = '\0';
  }
}

void startPulseOutput(PulseOutput &output, byte pulseCount) {
  output.remainingPulses = pulseCount;
  output.pulseOn = false;
  output.lastChangeAt = millis() - HUMIDIFIER_PULSE_GAP_MS;
  digitalWrite(output.pin, LOW);
}

void handleHumidifierCommand(byte index) {
  if (strcmp(commandBuffer, "on") == 0) {
    startPulseOutput(humidifiers[index], 1);
  } else if (strcmp(commandBuffer, "off") == 0) {
    startPulseOutput(humidifiers[index], 2);
  }
}

void finishCommand() {
  if (strcmp(activeCommand, "l") == 0) {
    if (strcmp(commandBuffer, "on") == 0) {
      digitalWrite(LED_CONTROL_PIN, HIGH);
    } else if (strcmp(commandBuffer, "off") == 0) {
      digitalWrite(LED_CONTROL_PIN, LOW);
    }
  } else if (strcmp(activeCommand, "h1") == 0) {
    handleHumidifierCommand(0);
  } else if (strcmp(activeCommand, "h2") == 0) {
    handleHumidifierCommand(1);
  } else if (strcmp(activeCommand, "r") == 0) {
    applyRawDisplayCommand();
  }
}

void clearPendingCommand() {
  pendingCommandLength = 0;
  pendingCommand[0] = '\0';
}

void appendPendingCommand(char c) {
  if (c >= 'A' && c <= 'Z') {
    c += 'a' - 'A';
  }

  if (pendingCommandLength < sizeof(pendingCommand) - 1) {
    pendingCommand[pendingCommandLength++] = c;
    pendingCommand[pendingCommandLength] = '\0';
  } else {
    clearPendingCommand();
  }
}

bool isKnownPendingCommand() {
  return strcmp(pendingCommand, "d") == 0 || strcmp(pendingCommand, "l") == 0 ||
         strcmp(pendingCommand, "r") == 0 || strcmp(pendingCommand, "h1") == 0 ||
         strcmp(pendingCommand, "h2") == 0;
}

void updatePulseOutput(PulseOutput &output) {
  unsigned long now = millis();

  if (output.pulseOn) {
    if (now - output.lastChangeAt >= HUMIDIFIER_PULSE_ON_MS) {
      output.pulseOn = false;
      output.lastChangeAt = now;
      digitalWrite(output.pin, LOW);
    }
    return;
  }

  if (output.remainingPulses > 0 &&
      now - output.lastChangeAt >= HUMIDIFIER_PULSE_GAP_MS) {
    output.remainingPulses--;
    output.pulseOn = true;
    output.lastChangeAt = now;
    digitalWrite(output.pin, HIGH);
  }
}

void updateHumidifierPulses() {
  for (byte i = 0; i < sizeof(humidifiers) / sizeof(humidifiers[0]); i++) {
    updatePulseOutput(humidifiers[i]);
  }
}

void refreshVisibleCells() {
  for (byte i = 0; i < DIGIT_COUNT; i++) {
    byte sourceIndex = slideIndex + i;
    visibleCells[i] = sourceIndex < messageCellCount ? messageCells[sourceIndex] : 0;
  }
}

void updateSlide() {
  if (messageCellCount <= DIGIT_COUNT) {
    slideIndex = 0;
    refreshVisibleCells();
    return;
  }

  unsigned long now = millis();
  if (now - lastSlideAt >= SLIDE_INTERVAL_MS) {
    lastSlideAt = now;
    slideIndex++;
    if (slideIndex > messageCellCount - DIGIT_COUNT) {
      slideIndex = 0;
    }
    refreshVisibleCells();
  }
}

void allDigitsOff() {
  for (byte i = 0; i < DIGIT_COUNT; i++) {
    digitalWrite(DIGIT_PINS[i], DIGIT_OFF);
  }
}

void writeSegments(byte glyph) {
  for (byte i = 0; i < SEGMENT_COUNT; i++) {
    bool on = (glyph & (1 << i)) != 0;
    digitalWrite(SEGMENT_PINS[i], on ? SEGMENT_ON : SEGMENT_OFF);
  }
}

void scanDisplay() {
  allDigitsOff();
  writeSegments(visibleCells[scanDigit]);
  digitalWrite(DIGIT_PINS[scanDigit], DIGIT_ON);
  delayMicroseconds(DIGIT_HOLD_US);
  digitalWrite(DIGIT_PINS[scanDigit], DIGIT_OFF);

  scanDigit++;
  if (scanDigit >= DIGIT_COUNT) {
    scanDigit = 0;
  }
}

void handleSerial() {
  while (Serial.available() > 0) {
    char c = Serial.read();

    if (readingDisplayCommand) {
      if (c == ']') {
        finishCommand();
        readingDisplayCommand = false;
        activeCommand[0] = '\0';
        continue;
      }

      if (c == '\r' || c == '\n') {
        continue;
      }

      if (strcmp(activeCommand, "d") == 0 && isDisplayChar(c)) {
        appendDisplayChar(c);
        refreshVisibleCells();
      } else if (strcmp(activeCommand, "l") == 0 ||
                 strcmp(activeCommand, "r") == 0 ||
                 strcmp(activeCommand, "h1") == 0 ||
                 strcmp(activeCommand, "h2") == 0) {
        appendCommandChar(c);
      }
      continue;
    }

    if (waitingCommandOpen) {
      if (c == '[') {
        waitingCommandOpen = false;
        strcpy(activeCommand, pendingCommand);
        clearPendingCommand();
        readingDisplayCommand = true;
        clearCommandBuffer();
        if (strcmp(activeCommand, "d") == 0) {
          clearMessage();
          refreshVisibleCells();
        }
      } else if (c != '\r' && c != '\n' && c != ' ') {
        waitingCommandOpen = false;
        clearPendingCommand();
      }
      continue;
    }

    if (c == 'd' || c == 'l' || c == 'r') {
      clearPendingCommand();
      appendPendingCommand(c);
      waitingCommandOpen = true;
    } else if (c == 'h') {
      clearPendingCommand();
      appendPendingCommand(c);
    } else if (pendingCommandLength > 0) {
      appendPendingCommand(c);
      if (isKnownPendingCommand()) {
        waitingCommandOpen = true;
      } else if (pendingCommandLength >= sizeof(pendingCommand) - 1) {
        clearPendingCommand();
      }
    }
  }
}

void checkDoorChange() {
  int doorState = digitalRead(DOOR_INPUT_PIN);
  if (doorState == lastDoorState) {
    return;
  }

  lastDoorState = doorState;
  Serial.println(doorState == HIGH ? "c[close]" : "c[open]");
}

void setup() {
  for (byte i = 0; i < DIGIT_COUNT; i++) {
    pinMode(DIGIT_PINS[i], OUTPUT);
    digitalWrite(DIGIT_PINS[i], DIGIT_OFF);
  }

  for (byte i = 0; i < SEGMENT_COUNT; i++) {
    pinMode(SEGMENT_PINS[i], OUTPUT);
    digitalWrite(SEGMENT_PINS[i], SEGMENT_OFF);
  }

  pinMode(LED_CONTROL_PIN, OUTPUT);
  digitalWrite(LED_CONTROL_PIN, LOW);

  pinMode(DOOR_INPUT_PIN, INPUT);
  lastDoorState = digitalRead(DOOR_INPUT_PIN);

  for (byte i = 0; i < sizeof(humidifiers) / sizeof(humidifiers[0]); i++) {
    pinMode(humidifiers[i].pin, OUTPUT);
    digitalWrite(humidifiers[i].pin, LOW);
  }

  Serial.begin(9600);
  Serial.println(lastDoorState == HIGH ? "c[close]" : "c[open]");
  clearMessage();
  refreshVisibleCells();
}

void loop() {
  handleSerial();
  checkDoorChange();
  updateHumidifierPulses();
  updateSlide();
  scanDisplay();
}
