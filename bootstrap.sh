#!/bin/bash
# bootstrap.sh — 按 repos.yaml 把所有内部仓代码拉到本地对应路径
#
# 用法：
#   bash bootstrap.sh           # 拉取/更新所有仓
#   bash bootstrap.sh <name>    # 只拉取/更新某个具体仓（services 或 frontend 中的 key）
#
# 行为：
#   - 路径不存在或为空目录 → git clone
#   - 路径已是 git 仓 → git pull（保留本地未提交改动则跳过 pull 并提示）
#   - 路径已存在但不是 git 仓 → 报错跳过

set -e

REPOS_FILE="repos.yaml"
TARGET="${1:-}"

if [ ! -f "$REPOS_FILE" ]; then
    echo "错误：找不到 $REPOS_FILE"
    exit 1
fi

if ! command -v yq >/dev/null 2>&1; then
    echo "错误：需要安装 yq（https://github.com/mikefarah/yq）"
    echo "  macOS: brew install yq"
    exit 1
fi

# 处理单个仓
process_one() {
    local name=$1
    local git=$2
    local branch=$3
    local path=$4

    if [ -z "$git" ] || [ "$git" = "null" ]; then
        return
    fi

    echo ""
    echo "── $name ──"
    echo "   git:    $git"
    echo "   branch: $branch"
    echo "   path:   $path"

    if [ ! -d "$path" ] || [ -z "$(ls -A "$path" 2>/dev/null | grep -v '^\.gitkeep$' || true)" ]; then
        # 目录不存在或只有 .gitkeep
        echo "   动作:   clone"
        rm -rf "$path"
        git clone --branch "$branch" "$git" "$path"
    elif [ -d "$path/.git" ]; then
        # 已经是 git 仓
        if [ -n "$(cd "$path" && git status --porcelain)" ]; then
            echo "   动作:   跳过 pull（有未提交改动）"
        else
            echo "   动作:   pull"
            (cd "$path" && git pull --ff-only)
        fi
    else
        echo "   动作:   跳过（目录非空且不是 git 仓，请人工检查）"
    fi
}

# 遍历 services、frontend 三个分组
for group in backend frontend; do
    KEYS=$(yq ".$group | keys | .[]" "$REPOS_FILE" 2>/dev/null || true)
    [ -z "$KEYS" ] && continue

    for name in $KEYS; do
        # 去掉 yq 输出的引号
        name=$(echo "$name" | tr -d '"')

        # 如果指定了 TARGET，则只处理匹配的
        if [ -n "$TARGET" ] && [ "$name" != "$TARGET" ]; then
            continue
        fi

        GIT=$(yq ".$group.\"$name\".git" "$REPOS_FILE" | tr -d '"')
        BRANCH=$(yq ".$group.\"$name\".branch" "$REPOS_FILE" | tr -d '"')
        PATH_=$(yq ".$group.\"$name\".path" "$REPOS_FILE" | tr -d '"')

        process_one "$name" "$GIT" "$BRANCH" "$PATH_"
    done
done

echo ""
echo "完成。"
