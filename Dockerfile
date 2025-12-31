# ---------------------------------------------------
# 使用 Node.js 20 Alpine 作为基础镜像
# ---------------------------------------------------
FROM node:20-alpine

# 设置容器内的工作目录
WORKDIR /app

# 1. 复制依赖定义文件
# 只复制 package.json，忽略 lock 文件以强制重新解析版本，解决依赖版本不存在的问题
COPY package.json ./

# 2. 安装所有依赖
# --legacy-peer-deps 用于解决潜在的依赖冲突
RUN npm install --legacy-peer-deps

# 3. 复制项目所有源代码
# .dockerignore 会排除 node_modules，防止覆盖
COPY . .

# 4. 执行前端构建
# 这将生成 dist 目录，供 server.ts 托管
RUN npm run build

# 5. 暴露端口
# Zeabur 会自动识别此端口
EXPOSE 3000

# 6. 启动命令
# 直接使用 tsx 运行 TypeScript 后端
CMD ["npm", "start"]
