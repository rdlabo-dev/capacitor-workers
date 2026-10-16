// Shared expectations for the original Worker and the browser fetch adapter.
export const cases = [
  {
    path: "/",
    status: 200,
    contentType: "text/html",
    text: [
      "<!DOCTYPE html>",
      "<title>Top</title>",
      '<a href="/">Hono Example</a>',
      ...[
        "Good Morning",
        "Good Afternoon",
        "Good Evening",
        "Good Night",
        "こんにちは",
      ].map((title, index) => `<a href="/post/${index + 1}">${title}</a>`),
    ],
  },
  {
    path: "/post/1",
    status: 200,
    contentType: "text/html",
    text: [
      "<title>Good Morning</title>",
      "<h2>Good Morning</h2>",
      "<p>Let us eat breakfast</p>",
    ],
  },
  {
    path: "/post/5",
    status: 200,
    contentType: "text/html",
    text: ["<title>こんにちは</title>", "<p>昼からビールを飲みます</p>"],
  },
  ...["/post/99", "/post/abc", "/no-such-path"].map((path) => ({
    path,
    status: 404,
    contentType: "text/plain",
    text: ["404 Not Found"],
  })),
];
