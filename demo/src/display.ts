// Demo API call and presentation; Workers setup lives in main.ts.
const output = document.querySelector("pre")!;
try {
  await import("./main");
  const response = await fetch("/api/hello?name=Capacitor");
  output.textContent = JSON.stringify(await response.json(), null, 2);
} catch (error) {
  output.textContent = String(error);
}

export {};
