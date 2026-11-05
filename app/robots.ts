import type { MetadataRoute } from "next";

// 전달 링크와 관리 화면, API는 검색엔진이 긁어 가지 않게 한다. (링크 페이지 자체는 noindex 메타도 따로 있다)
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/share/", "/share-admin", "/outreach", "/api/"] },
  };
}
