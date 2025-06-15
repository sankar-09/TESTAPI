1. npm init -y
2. npm install mysql2 winston winston-daily-rotate-file dotenv
3. npm install -D typescript ts-node @types/node @types/winston
4. npm install -D nodemon @types/fs-extra
5. npm install express http-proxy
6. npm install -D typescript ts-node @types/node @types/express
7. npm i http-proxy
8. npm install cloudinary
9. npm install dotenv
10. npm install jsonwebtoken
11. npm install -D @types/jsonwebtoken

-----------Docker
docker ps -a
docker build -t test-api .
docker images
cd ..
docker build .\TESTAPI_NR\ -t test-api:latest
docker run --name api -p 3000:3000/tcp -d test-api

docker run --name api --env-file "TESTAPI_NR\.env" -p 3000:3000 -d test-api

docker ps -a
docker logs -f api
docker kill api
docker rm api
