// Demo presentation only; this is not part of the Workers setup.
const output = document.querySelector("pre")!;
try {
  const { message } = await import("./main");
  output.textContent = JSON.stringify(message, null, 2);
} catch (error) {
  output.textContent = String(error);
}

export {};
