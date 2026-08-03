import https from "https";

const folder = "1_XYeXzYHl_-l3550dvYMbAb9aD8rKct1";

https.get("https://drive.google.com/drive/folders/" + folder, (r) => {
    let d = "";

    r.on("data", (c) => d += c);

    r.on("end", () => {
        console.log(d.includes(".mp4") ? "tem mp4" : "sem mp4");
    });
});
