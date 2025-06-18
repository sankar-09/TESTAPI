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

---------->Linux

1. sudo docker ps -a
2. sudo docker build -t ec2-user .
3. sudo docker images
4. cd ..
5. sudo docker build ./myappcontainer -t ec2-user:latest
6. sudo docker run --name api -p 3000:3000/tcp -d ec2-user
7. sudo docker run --name api --env-file "./myappcontainer.env" -p 3000:3000 -d ec2-user
8. sudo docker ps -a
9. sudo docker logs -f api
10. sudo docker kill api
11. sudo docker rm api
