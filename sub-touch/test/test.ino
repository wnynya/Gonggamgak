void setup() {
  pinMode(A0, OUTPUT);
  pinMode(A1, INPUT);

  analogWrite(A0, 127);

  Serial.begin(9600);
}

void loop() {
  int v = analogRead(A1);
  Serial.println(v);
}