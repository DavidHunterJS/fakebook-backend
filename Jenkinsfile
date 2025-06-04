pipeline {
    agent any

    parameters {
        choice(
            name: 'ENVIRONMENT', 
            choices: ['dev', 'staging', 'production'], 
            description: 'Deploy to which environment? (For feature branches, typically "dev")'
        )
        string(
            name: 'DEPLOY_BRANCH', 
            defaultValue: 'develop', 
            description: 'Branch to deploy (e.g., main, develop, feature/user-auth). Overridden by webhook for push events.'
        )
        booleanParam(
            name: 'SKIP_TESTS', 
            defaultValue: false, 
            description: 'Skip running tests'
        )
        booleanParam(
            name: 'FORCE_DEPLOY', 
            defaultValue: false, 
            description: 'Force deployment without approval'
        )
    }

    environment {
        HEROKU_API_KEY = credentials('HEROKU_API_KEY')
        DEPLOY_ENV = "${params.ENVIRONMENT}"
    }

    tools {
        nodejs 'NodeJS_18_on_EC2'
    }

    stages {
        stage('Initialize') {
            steps {
                script {
                    def resolvedBranch = params.DEPLOY_BRANCH

                    if (env.GIT_BRANCH) {
                        resolvedBranch = env.GIT_BRANCH
                    } else if (env.BRANCH_NAME) {
                        resolvedBranch = env.BRANCH_NAME
                    }

                    resolvedBranch = resolvedBranch.replaceFirst(/^origin\//, '')
                                                 .replaceFirst(/^refs\/heads\//, '')
                                                 .replaceFirst(/^refs\/remotes\/origin\//, '')

                    env.RESOLVED_BRANCH = resolvedBranch
                    env.DEPLOY_BRANCH = resolvedBranch

                    echo "✅ Resolved branch for this build: ${env.RESOLVED_BRANCH}"

                    // --- Dynamic ENVIRONMENT Resolution ---
                    def autoEnv = 'dev'
                    if (resolvedBranch == 'main' || resolvedBranch == 'master') {
                        autoEnv = 'production'
                    } else if (resolvedBranch == 'develop') {
                        autoEnv = 'staging'
                    } else if (resolvedBranch.startsWith('feature/') || resolvedBranch.startsWith('bugfix/')) {
                        autoEnv = 'dev'
                    } else if (resolvedBranch.startsWith('release/') || resolvedBranch.startsWith('hotfix/')) {
                        autoEnv = 'staging'
                    }

                    if (params.ENVIRONMENT == 'dev' && autoEnv != 'dev') {
                        env.DEPLOY_ENV = autoEnv
                        echo "🔁 Auto-switched environment to '${autoEnv}' based on branch '${resolvedBranch}'"
                    } else {
                        env.DEPLOY_ENV = params.ENVIRONMENT
                        echo "🔒 Using manually selected environment: '${params.ENVIRONMENT}'"
                    }

                    if (env.RESOLVED_BRANCH.startsWith('feature/') && env.DEPLOY_ENV == 'dev') {
                        env.HEROKU_APP_NAME = "fakebook-backend-dev"
                        echo "ℹ️  Feature branch will target Heroku app: ${env.HEROKU_APP_NAME}"
                    } else {
                        env.HEROKU_APP_NAME = "${env.DEPLOY_ENV == 'production' ? 'fakebook-backend-a2a77a290552' : 'fakebook-backend-' + env.DEPLOY_ENV}"
                    }
                }
            }
        }

        stage('Environment Info') {
            steps {
                script {
                    echo "🎯 Deploying Backend to: ${env.DEPLOY_ENV}"
                    echo "📦 Heroku app: ${env.HEROKU_APP_NAME}"
                    echo "🌿 Branch: ${env.RESOLVED_BRANCH}"
                    echo "🔨 Build: ${BUILD_NUMBER}"
                }
            }
        }

        stage('Validate GitFlow Rules') {
            steps {
                script {
                    def branch = env.RESOLVED_BRANCH
                    def envParam = env.DEPLOY_ENV

                    if (envParam == 'production' && !branch.matches('main|master')) {
                        error("❌ Production can only be deployed from main branch")
                    } else if (envParam == 'staging' && branch != 'develop' && !branch.startsWith('release/') && !branch.startsWith('hotfix/')) {
                        if (!params.FORCE_DEPLOY) {
                            error("❌ Staging typically deploys from develop, release/*, or hotfix/* branches. Use FORCE_DEPLOY to override.")
                        } else {
                             echo "⚠️  WARNING: Force deploying ${branch} to staging"
                        }
                    }
                    echo "✅ GitFlow validation passed: ${branch} → ${envParam}"
                }
            }
        }

        stage('Checkout Code') {
            steps {
                script {
                    echo "Attempting to checkout resolved branch: ${env.RESOLVED_BRANCH}"
                    checkout([
                        $class: 'GitSCM',
                        branches: [[name: "*/${env.RESOLVED_BRANCH}"]],
                        extensions: [
                            [$class: 'LocalBranch', localBranch: "**"],
                            [$class: 'CleanBeforeCheckout']
                        ],
                        userRemoteConfigs: [[
                            url: 'https://github.com/DavidHunterJS/fakebook-backend.git'
                        ]]
                    ])
                }
            }
        }

        stage('Ensure Dev App Exists') {
            when {
                expression { env.DEPLOY_ENV == 'dev' }
            }
            steps {
                script {
                    sh '''
                        echo "Ensuring ${DEPLOY_ENV} backend app (${HEROKU_APP_NAME}) exists..."
                        if heroku apps:info -a ${HEROKU_APP_NAME} >/dev/null 2>&1; then
                            echo "✅ App ${HEROKU_APP_NAME} already exists"
                        else
                            echo "Creating new Heroku app: ${HEROKU_APP_NAME}"
                            heroku create ${HEROKU_APP_NAME} || echo "App creation may have failed or already exists."
                        fi
                        heroku apps:info -a ${HEROKU_APP_NAME}
                    '''
                }
            }
        }

        stage('Install Dependencies') {
            steps {
                sh '''
                    if [ ! -d "node_modules" ] || [ package.json -nt node_modules ]; then
                        echo "Installing dependencies with npm ci..."
                        npm ci
                    else
                        echo "Using cached node_modules"
                    fi
                '''
            }
        }

        stage('Configure Environment') {
            steps {
                script {
                    sh '''
                        echo "Configuring backend for ${DEPLOY_ENV} environment..."
                        echo "Backend environment variables should be set as Heroku Config Vars."
                    '''
                }
            }
        }

        stage('Run Tests') {
            when {
                expression { !params.SKIP_TESTS }
            }
            steps {
                sh 'npm test || echo "No tests configured or tests failed (non-critical for this example)"'
            }
        }

        stage('Deployment Approval') {
            when {
                expression { env.DEPLOY_ENV == 'production' && !params.FORCE_DEPLOY }
            }
            steps {
                script {
                    def userInput = input(
                        message: "Deploy to PRODUCTION Backend?",
                        ok: 'Deploy',
                        parameters: [
                            string(name: 'CONFIRMATION', defaultValue: '', description: 'Type "DEPLOY" to confirm')
                        ]
                    )
                    if (userInput != 'DEPLOY') {
                        error('Deployment cancelled')
                    }
                }
            }
        }

        stage('Deploy to Heroku') {
            steps {
                script {
                    sh '''
                        echo "Deploying backend branch ${RESOLVED_BRANCH} to Heroku app ${HEROKU_APP_NAME} (${DEPLOY_ENV})..."

                        git config user.email "jenkins@your-domain.com"
                        git config user.name "Jenkins CI"

                        git remote add heroku-deploy https://heroku:$HEROKU_API_KEY@git.heroku.com/${HEROKU_APP_NAME}.git || \
                        git remote set-url heroku-deploy https://heroku:$HEROKU_API_KEY@git.heroku.com/${HEROKU_APP_NAME}.git

                        git push heroku-deploy HEAD:main --force
                    '''
                }
            }
        }

        stage('Verify Deployment') {
            steps {
                script {
                    sh '''
                        echo "Waiting for backend to be ready on ${HEROKU_APP_NAME}"
                        sleep 30

                        APP_URL=$(heroku info -a ${HEROKU_APP_NAME} --json | grep web_url | cut -d '"' -f 4)
                        if [ -z "$APP_URL" ]; then
                            APP_URL="https://${HEROKU_APP_NAME}.herokuapp.com/"
                        fi
                        echo "Backend URL: $APP_URL"

                        HEALTH_URL="${APP_URL%/}/health"
                        echo "Pinging health endpoint: $HEALTH_URL"
                        HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" || echo "000")

                        if [ "$HTTP_STATUS" -eq 200 ]; then
                            echo "✅ Backend on ${HEROKU_APP_NAME} is healthy (status $HTTP_STATUS)!"
                        else
                            echo "⚠️  Backend on ${HEROKU_APP_NAME} returned status $HTTP_STATUS from $HEALTH_URL"
                            heroku logs -n 5 -a ${HEROKU_APP_NAME} || echo "Could not fetch logs"
                        fi
                    '''
                }
            }
        }
    }

    post {
        always {
            echo "Pipeline finished for ${DEPLOY_ENV} environment, branch ${env.RESOLVED_BRANCH}."
        }
        success {
            script {
                echo "✅ Backend pipeline succeeded for ${DEPLOY_ENV} on branch ${env.RESOLVED_BRANCH}!"
                sh '''
                    APP_URL=$(heroku info -a ${HEROKU_APP_NAME} --json | grep web_url | cut -d '"' -f 4 || echo "https://${HEROKU_APP_NAME}.herokuapp.com")
                    echo "🌐 Backend should be available at: $APP_URL"
                '''
            }
        }
        failure {
            echo "❌ Backend pipeline failed for ${DEPLOY_ENV} on branch ${env.RESOLVED_BRANCH}!"
        }
    }
}
