int BTN = 7;
void press() {
  digitalWrite(BTN, HIGH);
  delay(50);
  digitalWrite(BTN, LOW);
  delay(50);
}

void setup() {
  pinMode(BTN, OUTPUT);
  digitalWrite(BTN, LOW);
  Serial.begin(9600);
}

void loop() {
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    if (cmd == "press") {
      Serial.println("p");
      press();
    }
  }
}