FROM node:26-alpine

WORKDIR /ttvmech
RUN ["mkdir", "-m", "755", "data"]

COPY ./package*.json .
RUN ["npm", "ci"]

COPY . .
RUN ["npm", "run", "build-all"]

EXPOSE 31314

CMD ["npm", "start"]