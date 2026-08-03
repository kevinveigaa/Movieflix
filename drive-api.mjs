import https from "https";

const folder = "1_XYeXzYHl_-l3550dvYMbAb9aD8rKct1";

const url = "https://drive.google.com/drive/folders/" + folder + "?usp=sharing";

https.get(url, (res) => {
    let data = "";

    res.on("data", chunk => data += chunk);

    res.on("end", () => {
        const ids = [...data.matchAll(/"([a-zA-Z0-9_-]{20,})"/g)]
          .map(x => x[1]);

        console.log("IDs encontrados:", ids.length);
        console.log(ids.slice(0,20));
    });
});
