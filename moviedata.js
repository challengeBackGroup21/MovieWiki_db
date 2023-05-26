const axios = require("axios");
const { Client } = require("pg");
const Agent = require("agentkeepalive");
const HttpsAgent = require("agentkeepalive").HttpsAgent;
const { development, movieKey, host } = require("./config/config");

// PostgreSQL 연결 설정
const client = new Client({
  host: "development.host",
  port: host.port,
  user: "development.username",
  password: "development.password",
  database: "development.database",
});

// HTTP 요청에 대하 소켓 연결을 관리
const keepAliveAgent = new Agent({
  maxSockets: 160, // 동시 유지 최대 소켓 수
  maxFreeSockets: 160, // 사용되지 않는 최대 소켓 수
  timeout: 60000, // 소켓 연결 타입아웃
  freeSocketTimeout: 30000, // 유휴 소켓 해제되기까지 시간
  keepAliveMsecs: 60000, // 유휴 소켓 유지 시간
});

const httpsKeepAliveAgent = new HttpsAgent({
  maxSockets: 160,
  maxFreeSockets: 160,
  timeout: 60000,
  freeSocketTimeout: 30000,
  keepAliveMsecs: 60000,
});

// 영화진흥위원회 API에서 데이터 가져오기
async function MovieData() {
  try {
    // 1. 처음에는 1페이지를 요청하여 전체 데이터의 총 개수 확인
    const initialResponse = await axios.get(
      `https://www.kobis.or.kr/kobisopenapi/webservice/rest/movie/searchMovieList.json?key=${movieKey.secret}&itemPerPage=1&page=1`
    );

    const initialData = initialResponse.data;
    const totCnt = initialData.movieListResult.totCnt;

    // 2. totCnt 값을 기반으로 페이지당 데이터 수(numOfRows)와 총 페이지 수(totalPage) 계산
    const numOfRows = 100; // 한 페이지에 포함될 데이터 수 (조정 가능)
    const totalPage = Math.ceil(totCnt / numOfRows);

    // 3. 페이지를 순회하며 데이터 가져오기 및 저장
    await client.connect();
    await client.query(
      `CREATE TABLE IF NOT EXISTS "Movie" (
        "movieId" SERIAL PRIMARY KEY,
        "movieCd" VARCHAR(255),
        "movieNm" VARCHAR(255),
        "showTm" VARCHAR(255),
        "openDt" VARCHAR(255),
        "typeNm" VARCHAR(255),
        "nationAlt" VARCHAR(255),
        "genreAlt" VARCHAR(255),
        "directors" JSONB,
        "actors" JSONB,
        "watchGradeNm" VARCHAR(255),
        "likes" INT DEFAULT 0,
        "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );`
    );

    for (let page = 1; page <= totalPage; page++) {
      const response = await axios.get(
        `https://www.kobis.or.kr/kobisopenapi/webservice/rest/movie/searchMovieList.json?key=${movieKey.secret}&itemPerPage=${numOfRows}&curPage=${page}`,
        {
          httpAgent: keepAliveAgent,
          httpsAgent: httpsKeepAliveAgent,
        }
      );
      const data = response.data;
      const movies = data.movieListResult.movieList;

      for (const movie of movies) {
        const {
          movieCd,
          movieNm,
          openDt,
          typeNm,
          nationAlt,
          genreAlt,
          directors,
        } = movie;

        // movieCd에 해당하는 상세정보 가져오기
        const detailResponse = await axios.get(
          `https://www.kobis.or.kr/kobisopenapi/webservice/rest/movie/searchMovieInfo.json?key=${movieKey.secret}&itemPerPage&movieCd=${movieCd}`,
          {
            httpAgent: keepAliveAgent,
            httpsAgent: httpsKeepAliveAgent,
          }
        );

        const detailData = detailResponse.data;
        // console.log(data);
        // 상세정보의 데이터에서 movieInfo 객체 저장
        const movieInfo = detailData.movieInfoResult.movieInfo;

        const { showTm, actors, audits } = movieInfo;
        // audits[0]이 존재하지 않으면, undefined를 반환하는데, undefined이면 병합연산자를 이용해 null 반환
        const watchGradeNm = audits[0]?.watchGradeNm ?? null;

        // 중복 데이터인지 확인
        const existingMovie = await client.query(
          `SELECT * FROM "Movie" WHERE "movieCd" = $1`,
          [movieCd]
        );

        // 중복되지 않은 경우에만 저장
        if (existingMovie.rows.length === 0 && movieInfo) {
          await client.query(
            `INSERT INTO "Movie" ("movieCd", "movieNm","showTm", "openDt", "typeNm", "nationAlt", "genreAlt", "directors", "actors", "watchGradeNm") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              movieCd,
              movieNm,
              showTm,
              openDt,
              typeNm,
              nationAlt,
              genreAlt,
              JSON.stringify(directors),
              JSON.stringify(actors),
              watchGradeNm,
            ]
          );
        }
      }
    }

    console.log("데이터 저장 완료!");
  } catch (error) {
    console.error("데이터 저장 중 오류 발생:", error);
  } finally {
    await client.end();
  }
}

// 데이터 가져오기 및 저장 실행
MovieData();
