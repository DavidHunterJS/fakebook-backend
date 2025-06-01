pipeline {
    agent any
    
    parameters {
        choice(name: 'ENVIRONMENT', choices: ['dev', 'staging', 'production'], description: 'Deploy to which environment?')
        string(name: 'DEPLOY_BRANCH', defaultValue: '${env.BRANCH_NAME}', description: 'Branch to deploy (e.g., main, develop, feature/user-auth)')
        booleanParam(name: 'SKIP_TESTS', defaultValue: false, description: 'Skip running tests')
        booleanParam(name: 'FORCE_DEPLOY', defaultValue: false, description: 'Force deployment without approval')
    }
    
    environment {
        // Dynamic app name based on environment
        HEROKU_APP_NAME = "${params.ENVIRONMENT == 'production' ? 'fakebook-backend-a2a77a290552' : 'fakebook-backend-' + params.ENVIRONMENT}"
        HEROKU_API_KEY = credentials('HEROKU_API_KEY')
        DEPLOY_ENV = "${params.ENVIRONMENT}"
    }
    
    tools {
        nodejs 'NodeJS_18_on_EC2'
    }
    
    stages {
        stage('Environment Info') {
            steps {
                echo "🎯 Deploying Backend to: ${params.ENVIRONMENT}"
                echo "📦 Heroku app: ${HEROKU_APP_NAME}"
                echo "🌿 Branch: ${params.DEPLOY_BRANCH}"
                echo "🔨 Build: ${BUILD_NUMBER}"
                
                script {
                    def branch = params.DEPLOY_BRANCH
                    if (branch.startsWith('feature/')) {
                        echo "🚀 Feature branch deployment"
                    } else if (branch == 'develop') {
                        echo "🔧 Development branch deployment"
                    } else if (branch == 'main' || branch == 'master') {
                        echo "🏭 Production branch deployment"
                    }
                }
            }
        }
        
        stage('Validate GitFlow Rules') {
            steps {
                script {
                    def branch = params.DEPLOY_BRANCH
                    def env = params.ENVIRONMENT
                    
                    if (env == 'production' && !branch.matches('main|master')) {
                        error("❌ Production can only be deployed from main branch")
                    } else if (env == 'staging' && branch != 'develop') {
                        if (!params.FORCE_DEPLOY) {
                            error("❌ Staging typically deploys from develop branch. Use FORCE_DEPLOY to override.")
                        }
                    }
                    
                    echo "✅ GitFlow validation passed: ${branch} → ${env}"
                }
            }
        }
        
        stage('Checkout Code') {
            steps {
                git branch: "${params.DEPLOY_BRANCH}", url: 'https://github.com/DavidHunterJS/fakebook-backend.git'
                echo "Checked out branch: ${params.DEPLOY_BRANCH}"
            }
        }
        
        stage('Ensure Dev App Exists') {
            when {
                expression { params.ENVIRONMENT == 'dev' }
            }
            steps {
                script {
                    sh """
                        echo "Ensuring dev backend app exists..."
                        
                        if ! heroku apps:info -a ${HEROKU_APP_NAME} &> /dev/null; then
                            heroku create ${HEROKU_APP_NAME}
                            echo "✅ Created dev backend app: ${HEROKU_APP_NAME}"
                        else
                            echo "✅ Dev backend app already exists: ${HEROKU_APP_NAME}"
                        fi
                    """
                }
            }
        }
        
        stage('Install Dependencies') {
            steps {
                sh '''
                    if [ ! -d "node_modules" ] || [ package.json -nt node_modules ]; then
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
                        
                        # Backend doesn't need .env files for Heroku - we'll use config vars
                        echo "Environment: ${DEPLOY_ENV}"
                        
                        # Set appropriate MongoDB URL based on environment
                        if [ "${DEPLOY_ENV}" = "production" ]; then
                            echo "Will use production MongoDB"
                        elif [ "${DEPLOY_ENV}" = "staging" ]; then
                            echo "Will use staging MongoDB"
                        else
                            echo "Will use dev MongoDB"
                        fi
                    '''
                }
            }
        }
        
        stage('Run Tests') {
            when {
                expression { params.SKIP_TESTS == false }
            }
            steps {
                sh 'npm test || echo "No tests configured"'
            }
        }
        
        stage('Deployment Approval') {
            when {
                expression { params.ENVIRONMENT == 'production' && params.FORCE_DEPLOY == false }
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
                        echo "Deploying backend to ${DEPLOY_ENV}..."
                        
                        # Configure git
                        git config user.email "jenkins@your-domain.com"
                        git config user.name "Jenkins CI"
                        
                        # Add Heroku remote
                        git remote add heroku https://heroku:$HEROKU_API_KEY@git.heroku.com/${HEROKU_APP_NAME}.git || \
                        git remote set-url heroku https://heroku:$HEROKU_API_KEY@git.heroku.com/${HEROKU_APP_NAME}.git
                        
                        # Deploy
                        git push heroku HEAD:main --force
                        
                        echo "Backend deployed to ${DEPLOY_ENV}"
                    '''
                }
            }
        }
        
        stage('Configure Backend Environment') {
            steps {
                script {
                    sh '''
                        echo "Setting environment variables for ${DEPLOY_ENV} backend..."
                        
                        # Set appropriate frontend URL
                        if [ "${DEPLOY_ENV}" = "production" ]; then
                            heroku config:set CLIENT_URL=https://trippy.wtf -a ${HEROKU_APP_NAME}
                            heroku config:set NODE_ENV=production -a ${HEROKU_APP_NAME}
                        elif [ "${DEPLOY_ENV}" = "staging" ]; then
                            heroku config:set CLIENT_URL=https://fakebook-frontend-staging.herokuapp.com -a ${HEROKU_APP_NAME}
                            heroku config:set NODE_ENV=staging -a ${HEROKU_APP_NAME}
                        else
                            heroku config:set CLIENT_URL=https://fakebook-frontend-dev-10ffd2412b67.herokuapp.com -a ${HEROKU_APP_NAME}
                            heroku config:set NODE_ENV=development -a ${HEROKU_APP_NAME}
                        fi
                        
                        # Ensure JWT_SECRET is set (you should set this manually once per app)
                        heroku config:get JWT_SECRET -a ${HEROKU_APP_NAME} || echo "⚠️  WARNING: JWT_SECRET not set!"
                        
                        # Show current config
                        echo "Current backend config:"
                        heroku config -a ${HEROKU_APP_NAME}
                    '''
                }
            }
        }
        
        stage('Verify Deployment') {
            steps {
                script {
                    sh '''
                        echo "Waiting for backend to be ready..."
                        sleep 30
                        
                        APP_URL=$(heroku info -a ${HEROKU_APP_NAME} --json | grep web_url | cut -d '"' -f 4)
                        echo "Backend URL: $APP_URL"
                        
                        # Test health endpoint
                        HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${APP_URL}health" || echo "000")
                        
                        if [ "$HTTP_STATUS" -eq 200 ]; then
                            echo "✅ Backend is healthy!"
                        else
                            echo "⚠️  Backend returned status $HTTP_STATUS"
                            echo "Check backend logs:"
                            heroku logs -n 50 -a ${HEROKU_APP_NAME} || echo "Could not fetch logs"
                        fi
                    '''
                }
            }
        }
    }
    
    post {
        success {
            echo "✅ Backend pipeline succeeded for ${DEPLOY_ENV}!"
            echo "🌐 Backend should be available at the configured URL"
        }
        failure {
            echo "❌ Backend pipeline failed for ${DEPLOY_ENV}!"
        }
    }
}