from flask import Flask, request, jsonify
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from pymongo import MongoClient

app = Flask(__name__)

client = MongoClient("mongodb://localhost:27017/")
db = client["internconnect"]


@app.route("/recommend", methods=["POST"])
def recommend():

    data = request.json
    user_skills = data["skills"]

    internships = list(db.internships.find())

    job_texts = []
    ids = []

    for job in internships:
        skills = " ".join(job.get("skills", []))
        job_texts.append(skills)
        ids.append(str(job["_id"]))

    texts = job_texts + [user_skills]

    vectorizer = TfidfVectorizer()
    tfidf = vectorizer.fit_transform(texts)

    similarity = cosine_similarity(tfidf[-1], tfidf[:-1])

    scores = similarity[0]

    result = []

    for i, score in enumerate(scores):
        if score > 0:
            result.append({
                "id": ids[i],
                "score": float(score)
            })

    result.sort(key=lambda x: x["score"], reverse=True)

    return jsonify(result[:5])


if __name__ == "__main__":
    app.run(port=5001)