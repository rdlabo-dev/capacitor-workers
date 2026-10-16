export async function startApp() {
  const output = document.querySelector("pre")!;
  try {
    const response = await fetch("/api/hello?name=Capacitor");
    output.textContent = JSON.stringify(await response.json(), null, 2);
  } catch (error) {
    output.textContent = String(error);
  }
}
